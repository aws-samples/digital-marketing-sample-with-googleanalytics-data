BEGIN TRANSACTION;

-- 一時テーブル
CREATE TEMP TABLE view_history_temp
(LIKE view_history);

COPY view_history_temp (user_id, item_id, view_datetime)
FROM 's3://{bucket_name}/{date}/view_history/'
IAM_ROLE '{iam_role}'
CSV;

-- 重複除去
CREATE TEMP TABLE view_history_deduped AS
SELECT DISTINCT user_id, item_id, view_datetime
FROM view_history_temp;

-- 実テーブルへのINSERT（重複を避ける）
INSERT INTO view_history (user_id, item_id, view_datetime)
SELECT vhd.user_id, vhd.item_id, vhd.view_datetime
FROM view_history_deduped vhd
WHERE NOT EXISTS (
    SELECT 1
    FROM view_history vh
    WHERE vh.user_id = vhd.user_id
    AND vh.item_id = vhd.item_id
    AND vh.view_datetime = vhd.view_datetime
);


END TRANSACTION;