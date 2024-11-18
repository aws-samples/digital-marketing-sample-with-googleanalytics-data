import boto3
import json
import csv
from io import StringIO
from datetime import datetime, timedelta, timezone
import time
import os
from db import db_cursor, exec_sql

s3 = boto3.client("s3")
rs = boto3.client("redshift-data")

GA_BUCKET_NAME = os.environ["GA_BUCKET_NAME"]
TMP_BUCKET_NAME = os.environ["TMP_BUCKET_NAME"]
REDSHIFT_ROLE_ARN = os.environ["REDSHIFT_ROLE_ARN"]
REDSHIFT_DATABASENAME = os.environ["REDSHIFT_DATABASENAME"]
REDSHIFT_WORKGROUP = os.environ["REDSHIFT_WORKGROUP"]
REGION = os.environ.get("REGION", "ap-northeast-1")
TEST_DATE = os.environ.get("TEST_DATE", "")

JST = timezone(timedelta(hours=+9))


def get_yesterday_date():
    return (datetime.now(JST) - timedelta(days=1)).date()


def get_ga_s3_files(folder_path):
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=GA_BUCKET_NAME, Prefix=folder_path)

    all_files = []
    for page in pages:
        if "Contents" in page:
            all_files.extend([obj["Key"] for obj in page["Contents"]])

    return all_files


def process_jsonl_file(file_key):
    response = s3.get_object(Bucket=GA_BUCKET_NAME, Key=file_key)
    content = response["Body"].read().decode("utf-8")

    csv_buffer = StringIO()
    csv_writer = csv.writer(csv_buffer)

    for line in content.splitlines():
        event = json.loads(line)
        if event["event_name"] == "view_item":
            user_id = event.get("user_id")
            if not user_id:
                user_id = event.get("user_pseudo_id")
            if not user_id:
                break
            items = event.get("items", [])
            if not items:
                break
            item_id = items[0].get("item_id")
            if not item_id:
                break
            csv_writer.writerow(
                [user_id, item_id, datetime.fromtimestamp(event["event_timestamp"] / 1000000.0, tz=JST).strftime("%Y-%m-%d %H:%M:%S%z")]
            )

    return csv_buffer.getvalue()


def upload_to_s3(bucket_name, file_key, data):
    s3.put_object(Bucket=bucket_name, Key=file_key, Body=data)


def load_to_rss(target_date):
    with open("galoadsql/load_view_history.sql", "r") as f:
        sql_template = f.read()
    params = {"bucket_name": TMP_BUCKET_NAME, "iam_role": REDSHIFT_ROLE_ARN, "date": target_date.strftime("%Y/%m/%d"), "region": REGION}

    sql = sql_template.format(**params)

    response = rs.execute_statement(Database=REDSHIFT_DATABASENAME, Sql=sql, WorkgroupName=REDSHIFT_WORKGROUP)
    return response["Id"]


def check_query_status(query_id):
    while True:
        response = rs.describe_statement(Id=query_id)
        status = response["Status"]
        if status == "FINISHED":
            print(f"COPY command for query ID {query_id} completed successfully.")
            break
        elif status in ["FAILED", "ABORTED"]:
            print(f"COPY command for query ID {query_id} failed with status: {status}")
            print(f"Error message: {response.get('Error', 'No error message available')}")
            raise
        else:
            print(f"COPY command for query ID {query_id} is still running. Current status: {status}")
            time.sleep(5)


def load_ga_process(yesterday):
    files = get_ga_s3_files(yesterday.strftime("%Y/%m/%d"))
    print(f"GA: Found {len(files)} files to process.")
    for index, file_key in enumerate(files, 1):
        print(f"Processing file {index} of {len(files)}: {file_key}")
        csv_data = process_jsonl_file(file_key)
        target_key = f"{yesterday.strftime('%Y/%m/%d')}/view_history/{file_key.split('/')[-1]}.csv"
        upload_to_s3(TMP_BUCKET_NAME, target_key, csv_data)
        print(f"Uploaded processed data to S3: {TMP_BUCKET_NAME}/{target_key}")

    query_id = load_to_rss(yesterday)
    print(f"Initiated COPY command. Query ID: {query_id}")
    check_query_status(query_id)


def dump_from_aurora(sql_file_path, table_name, target_date, params=None):
    if params is None:
        params = {}

    with open(sql_file_path, "r") as f:
        sql_template = f.read()

    params["bucket_name"] = TMP_BUCKET_NAME
    params["date"] = target_date.strftime("%Y/%m/%d")
    params["region"] = REGION

    sql = sql_template.format(**params)

    with db_cursor() as conn:
        exec_sql(conn, sql, params)

    s3_path = f"s3://{TMP_BUCKET_NAME}/{params['date']}/{table_name}/"
    print(f"Data exported to {s3_path}{table_name}.csv")
    return s3_path


def load_to_rss_dataloader(sql_file_path, table_name, s3_path, target_date, params=None):
    if params is None:
        params = {}

    with open(sql_file_path, "r") as f:
        sql_template = f.read()

    params["s3_path"] = f"{s3_path}{table_name}.csv"
    params["role_arn"] = REDSHIFT_ROLE_ARN
    params["bucket_name"] = TMP_BUCKET_NAME
    params["date"] = target_date.strftime("%Y/%m/%d")
    params["region"] = REGION
    sql = sql_template.format(**params)

    response = rs.execute_statement(Database=REDSHIFT_DATABASENAME, Sql=sql, WorkgroupName=REDSHIFT_WORKGROUP)
    query_id = response["Id"]

    print(f"Data for {table_name} loading to Redshift. Execution ID: {query_id}")
    check_query_status(query_id)
    print(f"Data for {table_name} successfully loaded to Redshift.")


def makesure_empty(target_date):
    s3pathprefix = target_date.strftime("%Y/%m/%d")
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=TMP_BUCKET_NAME, Prefix=s3pathprefix)

    delete_list = []
    for page in pages:
        if "Contents" in page:
            for obj in page["Contents"]:
                delete_list.append({"Key": obj["Key"]})

    if delete_list:
        s3.delete_objects(Bucket=TMP_BUCKET_NAME, Delete={"Objects": delete_list})

    print(f"Deleted {len(delete_list)} objects from {TMP_BUCKET_NAME}/{s3pathprefix}")


def load_aurora_process(yesterday):

    s3_paths = {}

    s3_paths["user_master"] = dump_from_aurora(
        "dumpsql/dump_user_master.sql", "user_master", yesterday, {"min_date": yesterday.strftime("%Y-%m-%d")}
    )
    s3_paths["interest_master"] = dump_from_aurora("dumpsql/dump_interest_master.sql", "interest_master", yesterday)
    s3_paths["item_master"] = dump_from_aurora("dumpsql/dump_item_master.sql", "item_master", yesterday)
    s3_paths["campaign"] = dump_from_aurora("dumpsql/dump_campaign.sql", "campaign", yesterday)
    s3_paths["user_interest"] = dump_from_aurora("dumpsql/dump_user_interest.sql", "user_interest", yesterday)
    s3_paths["purchase_history"] = dump_from_aurora(
        "dumpsql/dump_purchase_history.sql", "purchase_history", yesterday, {"min_date": yesterday.strftime("%Y-%m-%d")}
    )

    print("All dumps completed.")

    load_to_rss_dataloader("loadsql/load_user_master.sql", "user_master", s3_paths["user_master"], yesterday)
    load_to_rss_dataloader("loadsql/load_interest_master.sql", "interest_master", s3_paths["interest_master"], yesterday)
    load_to_rss_dataloader("loadsql/load_item_master.sql", "item_master", s3_paths["item_master"], yesterday)
    load_to_rss_dataloader("loadsql/load_campaign.sql", "campaign", s3_paths["campaign"], yesterday)
    load_to_rss_dataloader("loadsql/load_user_interest.sql", "user_interest", s3_paths["user_interest"], yesterday)
    load_to_rss_dataloader("loadsql/load_purchase_history.sql", "purchase_history", s3_paths["purchase_history"], yesterday)

    print("All loads completed.")


if __name__ == "__main__":
    if TEST_DATE:
        date_object = datetime.strptime(TEST_DATE, "%Y%m%d")
        target_date = date_object.replace(tzinfo=JST).date()
    else:
        target_date = get_yesterday_date()

    makesure_empty(target_date)
    print("## load_ga_process")
    load_ga_process(target_date)
    print("## load_aurora_process")
    load_aurora_process(target_date)
