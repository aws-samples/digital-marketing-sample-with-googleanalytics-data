
BEGIN TRANSACTION;

DELETE FROM item_master;

COPY item_master (item_id, item_name, price, item_category_id)
FROM 's3://{bucket_name}/{date}/item_master/item_master.csv'
IAM_ROLE '{role_arn}'
REGION '{region}'
FORMAT CSV
IGNOREHEADER 1;

END TRANSACTION;