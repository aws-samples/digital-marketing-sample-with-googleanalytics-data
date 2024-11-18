BEGIN TRANSACTION;

DELETE FROM campaign;

COPY campaign (campaign_id, campaign_name)
FROM 's3://{bucket_name}/{date}/campaign/campaign.csv'
IAM_ROLE '{role_arn}'
REGION '{region}'
CSV
IGNOREHEADER 1;


END TRANSACTION;