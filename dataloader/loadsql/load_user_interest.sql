BEGIN TRANSACTION;

CREATE TEMP TABLE user_interest_temp
(LIKE user_interest);

COPY user_interest_temp (user_id, interest_id)
FROM 's3://{bucket_name}/{date}/user_interest/user_interest.csv'
IAM_ROLE '{role_arn}'
REGION '{region}'
FORMAT CSV
IGNOREHEADER 1
;

MERGE INTO user_interest
USING user_interest_temp
ON user_interest.user_id = user_interest_temp.user_id
AND user_interest.interest_id = user_interest_temp.interest_id
WHEN MATCHED THEN
    UPDATE SET
    user_id = user_interest_temp.user_id,
    interest_id = user_interest_temp.interest_id
WHEN NOT MATCHED THEN
    INSERT (user_id, interest_id)
    VALUES (user_interest_temp.user_id, user_interest_temp.interest_id);

END TRANSACTION;