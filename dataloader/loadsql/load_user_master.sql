BEGIN TRANSACTION;

CREATE TEMP TABLE user_master_temp
(LIKE user_master);

COPY user_master_temp (user_id, email, gender, age, created_at, updated_at)
FROM 's3://{bucket_name}/{date}/user_master/user_master.csv'
IAM_ROLE '{role_arn}'
REGION '{region}'
FORMAT CSV
IGNOREHEADER 1
;

MERGE INTO user_master
USING user_master_temp
ON user_master.user_id = user_master_temp.user_id
WHEN MATCHED THEN
    UPDATE SET
    email = user_master_temp.email,
    gender = user_master_temp.gender,
    age = user_master_temp.age,
    created_at = user_master_temp.created_at,
    updated_at = user_master_temp.updated_at
WHEN NOT MATCHED THEN
    INSERT (user_id, email, gender, age, created_at, updated_at)
    VALUES (user_master_temp.user_id, user_master_temp.email, user_master_temp.gender, user_master_temp.age, user_master_temp.created_at, user_master_temp.updated_at);

END TRANSACTION;