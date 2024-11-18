import os
import boto3
import uuid
import time
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=+9))
BUCKET_NAME = os.environ["BUCKET_NAME"]
PINPOINT_ROLE_ARN = os.environ["PINPOINT_ROLE_ARN"]
PINPOINT_APP_ID = os.environ["PINPOINT_APP_ID"]
REDSHIFT_ROLE_ARN = os.environ["REDSHIFT_ROLE_ARN"]
REDSHIFT_DATABASENAME = os.environ["REDSHIFT_DATABASENAME"]
REDSHIFT_WORKGROUP = os.environ["REDSHIFT_WORKGROUP"]
REGION = os.environ.get("REGION", "ap-northeast-1")

rss = boto3.client("redshift-data", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
pinpoint = boto3.client("pinpoint", region_name=REGION)


def execute_redshift_query(query):
    response = rss.execute_statement(Database=REDSHIFT_DATABASENAME, WorkgroupName=REDSHIFT_WORKGROUP, Sql=query)
    query_id = response["Id"]

    while True:
        status_response = rss.describe_statement(Id=query_id)
        if status_response["Status"] == "FINISHED":
            break
        elif status_response["Status"] == "FAILED":
            raise Exception(f"Query failed: {status_response['Error']}")
        time.sleep(5)


def makesure_empty(s3pathprefix):
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix=s3pathprefix)

    delete_list = []
    for page in pages:
        if "Contents" in page:
            for obj in page["Contents"]:
                delete_list.append({"Key": obj["Key"]})

    if delete_list:
        s3.delete_objects(Bucket=BUCKET_NAME, Delete={"Objects": delete_list})

    print(f"Deleted {len(delete_list)} objects from {BUCKET_NAME}/{s3pathprefix}")


def prepare_dataset(s3path):
    makesure_empty(s3path)

    # 全ユーザデータを興味とともに
    query = f"""
        UNLOAD (
            'SELECT 
                user_id,
                email,
                gender,
                CAST(age AS VARCHAR(20)),
                COALESCE(interest_name, ''''),
                ''EMAIL''
            FROM (
                SELECT 
                    um.user_id,
                    um.email,
                    um.gender,
                    um.age,
                    im.interest_name,
                    ROW_NUMBER() OVER (PARTITION BY um.user_id ORDER BY ui.interest_id) as interest_rank
                FROM 
                    user_master um
                JOIN 
                    user_interest ui ON um.user_id = ui.user_id
                JOIN 
                    interest_master im ON ui.interest_id = im.interest_id
            ) ranked_interests
            WHERE 
                interest_rank = 1'
        )
        TO 's3://{BUCKET_NAME}/{s3path}'
        IAM_ROLE '{REDSHIFT_ROLE_ARN}'
        CSV
        PARALLEL OFF;
    """
    execute_redshift_query(query)
    return add_header_to_s3_file(s3path)


def add_header_to_s3_file(s3_path):
    file_key = get_s3_key(s3_path)
    header = "User.UserId,Address,User.UserAttributes.Gender,User.UserAttributes.Age,User.UserAttributes.InterestName,ChannelType"
    response = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
    existing_content = response["Body"].read().decode("utf-8")
    new_content = header + "\n" + existing_content
    s3.put_object(Bucket=BUCKET_NAME, Key=file_key, Body=new_content)
    return file_key


def get_s3_key(s3_path):
    response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=s3_path)
    if "Contents" in response and len(response["Contents"]) > 0:
        return response["Contents"][0]["Key"]
    else:
        raise ValueError(f"No file found in {s3_path}")


def import_segment_to_pinpoint(s3_key, target_date):
    segment_name = f"{target_date.strftime('%Y%m%d')}-{str(uuid.uuid4())}"
    import_job = pinpoint.create_import_job(
        ApplicationId=PINPOINT_APP_ID,
        ImportJobRequest={
            "DefineSegment": True,
            "Format": "CSV",
            "RegisterEndpoints": True,
            "RoleArn": PINPOINT_ROLE_ARN,
            "S3Url": f"s3://{BUCKET_NAME}/{s3_key}",
            "SegmentName": segment_name,
        },
    )
    job_id = import_job["ImportJobResponse"]["Id"]
    while True:
        job_status = pinpoint.get_import_job(ApplicationId=PINPOINT_APP_ID, JobId=job_id)["ImportJobResponse"]["JobStatus"]
        if job_status == "COMPLETED":
            print(f"Segment import completed. Segment name: {segment_name}")
            break
        elif job_status in ["FAILED", "CANCELLED"]:
            print(f"Segment import failed or was cancelled. Status: {job_status}")
            break


if __name__ == "__main__":

    target_date = datetime.now(JST).date()
    date_str = target_date.strftime("%Y/%m/%d")

    print(f"Processing data for date: {date_str}")
    s3path = f"{date_str}/user_list/"
    s3_key = prepare_dataset(s3path)
    import_segment_to_pinpoint(s3_key, target_date)
