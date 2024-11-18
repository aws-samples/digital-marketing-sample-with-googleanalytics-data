import os
import boto3
import uuid
import time
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=+9))
TEST_DATE = os.environ.get("TEST_DATE", "")
BUCKET_NAME = os.environ["BUCKET_NAME"]
PERSONALIZE_ROLE_ARN = os.environ["PERSONALIZE_ROLE_ARN"]
REDSHIFT_ROLE_ARN = os.environ["REDSHIFT_ROLE_ARN"]
REDSHIFT_DATABASENAME = os.environ["REDSHIFT_DATABASENAME"]
REDSHIFT_WORKGROUP = os.environ["REDSHIFT_WORKGROUP"]
REGION = os.environ.get("REGION", "ap-northeast-1")
PERSONALIZE_DSG = os.environ["PERSONALIZE_DSG"]
PERSONALIZE_ITEM_DATASET = os.environ["PERSONALIZE_ITEM_DATASET"]
PERSONALIZE_USER_DATASET = os.environ["PERSONALIZE_USER_DATASET"]
PERSONALIZE_INTERACTION_DATASET = os.environ["PERSONALIZE_INTERACTION_DATASET"]
PERSONALIZE_RECOMMENDER_NAME = os.environ["PERSONALIZE_RECOMMENDER_NAME"]
PERSONALIZE_RECIPE = os.environ.get("PERSONALIZE_RECIPE", "arn:aws:personalize:::recipe/aws-ecomm-customers-who-viewed-x-also-viewed")

rss = boto3.client("redshift-data", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
personalize = boto3.client("personalize", region_name=REGION)


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


def makesure_empty(target_date):
    s3pathprefix = target_date.strftime("%Y/%m/%d")
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


def prepare_dataset(target_date):
    makesure_empty(target_date)

    # 過去一ヶ月分のデータで学習
    one_month_ago = target_date - timedelta(days=31)
    date_str = target_date.strftime("%Y/%m/%d")

    # Interaction data
    interaction_query = f"""
    UNLOAD ('SELECT user_id, item_id, EXTRACT(EPOCH FROM view_datetime)::bigint as timestamp, ''View'' as event_type FROM view_history 
             WHERE view_datetime >= ''{one_month_ago}'' AND view_datetime < ''{target_date + timedelta(days=1)}''')
    TO 's3://{BUCKET_NAME}/{date_str}/interactions/'
    IAM_ROLE '{REDSHIFT_ROLE_ARN}'
    CSV HEADER;
    """
    execute_redshift_query(interaction_query)

    # User data (all users involved in the last month)
    user_query = f"""
    UNLOAD ('SELECT DISTINCT um.user_id, um.gender, um.age FROM user_master um
             JOIN view_history vh ON um.user_id = vh.user_id
             WHERE vh.view_datetime >= ''{one_month_ago}'' AND vh.view_datetime < ''{target_date + timedelta(days=1)}''')
    TO 's3://{BUCKET_NAME}/{date_str}/users/'
    IAM_ROLE '{REDSHIFT_ROLE_ARN}'
    CSV HEADER;
    """
    execute_redshift_query(user_query)

    # Item data (all items viewed in the last month)
    item_query = f"""
    UNLOAD ('SELECT DISTINCT im.item_id, im.item_category_id AS CATEGORY_L1, im.price FROM item_master im
             JOIN view_history vh ON im.item_id = vh.item_id
             WHERE vh.view_datetime >= ''{one_month_ago}'' AND vh.view_datetime < ''{target_date + timedelta(days=1)}''')
    TO 's3://{BUCKET_NAME}/{date_str}/items/'
    IAM_ROLE '{REDSHIFT_ROLE_ARN}'
    CSV HEADER;
    """
    execute_redshift_query(item_query)


def update_personalize_dataset(dataset_arn, s3_path):
    # Create a new import job
    import_job_response = personalize.create_dataset_import_job(
        jobName=f"Job-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4()}",
        datasetArn=dataset_arn,
        dataSource={"dataLocation": s3_path},
        roleArn=PERSONALIZE_ROLE_ARN,
        importMode="FULL",
    )

    import_job_arn = import_job_response["datasetImportJobArn"]

    # Wait for the import job to complete
    while True:
        import_job = personalize.describe_dataset_import_job(datasetImportJobArn=import_job_arn)
        status = import_job["datasetImportJob"]["status"]
        if status == "ACTIVE":
            break
        elif status == "CREATE FAILED":
            raise Exception("Dataset import job failed")
        time.sleep(60)


def create_recommender():
    existing_recommenders = personalize.list_recommenders(datasetGroupArn=PERSONALIZE_DSG)["recommenders"]
    existing_recommender = next((r for r in existing_recommenders if r["name"] == PERSONALIZE_RECOMMENDER_NAME), None)
    if not existing_recommender:
        response = personalize.create_recommender(
            name=PERSONALIZE_RECOMMENDER_NAME, datasetGroupArn=PERSONALIZE_DSG, recipeArn=PERSONALIZE_RECIPE
        )
        recommender_arn = response["recommenderArn"]

        while True:
            recommender = personalize.describe_recommender(recommenderArn=recommender_arn)
            status = recommender["recommender"]["status"]
            if status == "ACTIVE":
                break
            elif "FAIL" in status:
                raise Exception("Recommender creation failed")
            time.sleep(60)


if __name__ == "__main__":
    if TEST_DATE:
        target_date = datetime.strptime(TEST_DATE, "%Y%m%d").replace(tzinfo=JST).date()
    else:
        target_date = (datetime.now(JST) - timedelta(days=1)).date()

    print(f"Processing data for date: {target_date}")

    prepare_dataset(target_date)

    date_str = target_date.strftime("%Y/%m/%d")
    print("Importing interaction dataset...")
    update_personalize_dataset(PERSONALIZE_INTERACTION_DATASET, f"s3://{BUCKET_NAME}/{date_str}/interactions/")
    print("Importing user dataset...")
    update_personalize_dataset(PERSONALIZE_USER_DATASET, f"s3://{BUCKET_NAME}/{date_str}/users/")
    print("Importing item dataset...")
    update_personalize_dataset(PERSONALIZE_ITEM_DATASET, f"s3://{BUCKET_NAME}/{date_str}/items/")

    create_recommender()

    print("Completed")
