import sys
import boto3
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from datetime import datetime, timedelta, timezone

sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)

args = getResolvedOptions(sys.argv, ["JOB_NAME", "PROJECT_ID", "DATASET_ID", "DESTINATION_BUCKET", "CONNECTION_NAME"])
job.init(args["JOB_NAME"], args)

JST = timezone(timedelta(hours=+9))

test_date = None
if "--TEST_DATE" in sys.argv:
    test_date_index = sys.argv.index("--TEST_DATE")
    if test_date_index + 1 < len(sys.argv):
        test_date = sys.argv[test_date_index + 1]

if test_date:
    yesterday = test_date
else:
    yesterday = (datetime.now(JST) - timedelta(days=1)).strftime("%Y%m%d")

# BigQuery table name
table_name = f"{args['DATASET_ID']}.events_{yesterday}"

# S3 destination path
s3_destination = f"s3://{args['DESTINATION_BUCKET']}/{yesterday[:4]}/{yesterday[4:6]}/{yesterday[6:8]}/"


def delete_s3_files(bucket, prefix):
    s3 = boto3.resource("s3")
    bucket = s3.Bucket(bucket)
    bucket.objects.filter(Prefix=prefix).delete()


bucket_name = args["DESTINATION_BUCKET"]
prefix = f"{yesterday[:4]}/{yesterday[4:6]}/{yesterday[6:8]}/"
delete_s3_files(bucket_name, prefix)


# BigQuery to Glue Dynamic Frame
GoogleBigQuery_node = glueContext.create_dynamic_frame.from_options(
    connection_type="bigquery",
    connection_options={"connectionName": args["CONNECTION_NAME"], "parentProject": args["PROJECT_ID"], "table": table_name},
    transformation_ctx="GoogleBigQuery_node",
)

# Glue Dynamic Frame to S3
AmazonS3_node = glueContext.write_dynamic_frame.from_options(
    frame=GoogleBigQuery_node,
    connection_type="s3",
    format="json",
    connection_options={"path": s3_destination, "partitionKeys": []},
    transformation_ctx="AmazonS3_node",
)

job.commit()
