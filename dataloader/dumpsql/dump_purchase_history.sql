SELECT aws_s3.query_export_to_s3(
    'SELECT user_id, item_id, campaign_id, purchase_datetime
     FROM purchase_history
     WHERE purchase_datetime >= ''{min_date}''
     ',
    aws_commons.create_s3_uri(
        '{bucket_name}',
        '{date}/purchase_history/purchase_history.csv',
        '{region}'
    ),
    options :='format csv, header true'
);