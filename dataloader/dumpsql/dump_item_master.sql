SELECT aws_s3.query_export_to_s3(
    'SELECT item_id, item_name, price, item_category_id
     FROM item_master',
    aws_commons.create_s3_uri(
        '{bucket_name}',
        '{date}/item_master/item_master.csv',
        '{region}'
    ),
    options :='format csv, header true'
);