SELECT aws_s3.query_export_to_s3(
    'SELECT user_id, email, gender, age, created_at, updated_at
     FROM user_master
     WHERE updated_at >= ''{min_date}''',
    aws_commons.create_s3_uri(
        '{bucket_name}',
        '{date}/user_master/user_master.csv',
        '{region}'
    ),
    options :='format csv, header true'
);