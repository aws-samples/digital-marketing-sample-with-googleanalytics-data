SELECT aws_s3.query_export_to_s3(
    'SELECT user_id, interest_id
     FROM user_interest',
    aws_commons.create_s3_uri(
        '{bucket_name}',
        '{date}/user_interest/user_interest.csv',
        '{region}'
    ),
    options :='format csv, header true'
);