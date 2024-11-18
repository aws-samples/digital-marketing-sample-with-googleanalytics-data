SELECT aws_s3.query_export_to_s3(
    'SELECT campaign_id, campaign_name
     FROM campaign',
    aws_commons.create_s3_uri(
        '{bucket_name}',
        '{date}/campaign/campaign.csv',
        '{region}'
    ),
    options :='format csv, header true'
);