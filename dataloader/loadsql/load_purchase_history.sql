BEGIN TRANSACTION;

CREATE TEMP TABLE purchase_history_temp
(LIKE purchase_history);

COPY purchase_history_temp (user_id, item_id, campaign_id, purchase_datetime)
FROM 's3://{bucket_name}/{date}/purchase_history/purchase_history.csv'
IAM_ROLE '{role_arn}'
REGION '{region}'
FORMAT CSV
IGNOREHEADER 1
;

MERGE INTO purchase_history
USING purchase_history_temp
ON purchase_history.user_id = purchase_history_temp.user_id
AND purchase_history.item_id = purchase_history_temp.item_id
AND purchase_history.purchase_datetime = purchase_history_temp.purchase_datetime
WHEN MATCHED THEN
    UPDATE SET
    user_id = purchase_history_temp.user_id,
    item_id = purchase_history_temp.item_id,
    campaign_id = purchase_history_temp.campaign_id,
    purchase_datetime = purchase_history_temp.purchase_datetime
WHEN NOT MATCHED THEN
    INSERT (user_id, item_id, campaign_id, purchase_datetime)
    VALUES (purchase_history_temp.user_id, purchase_history_temp.item_id, 
            purchase_history_temp.campaign_id, purchase_history_temp.purchase_datetime);


END TRANSACTION;