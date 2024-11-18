SELECT aws_s3.query_export_to_s3(
    'SELECT interest_id, interest_name
     FROM interest_master',
    aws_commons.create_s3_uri(
        '{bucket_name}',
        '{date}/interest_master/interest_master.csv',
        '{region}'
    ),
    options :='format csv, header true'
);