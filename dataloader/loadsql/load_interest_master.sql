BEGIN TRANSACTION;

DELETE FROM interest_master;

COPY interest_master (interest_id, interest_name)
FROM 's3://{bucket_name}/{date}/interest_master/interest_master.csv'
IAM_ROLE '{role_arn}'
REGION '{region}'
FORMAT CSV
IGNOREHEADER 1
;

END TRANSACTION;