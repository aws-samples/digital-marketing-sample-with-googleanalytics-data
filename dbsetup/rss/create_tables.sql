
-- 興味マスタ
CREATE TABLE IF NOT EXISTS interest_master (
    interest_id BIGINT NOT NULL,
    interest_name VARCHAR(1024) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON interest_master TO PUBLIC;

-- ユーザマスタ
CREATE TABLE IF NOT EXISTS user_master (
    user_id CHAR(64) PRIMARY KEY,
    email CHAR(256) NOT NULL,
    gender VARCHAR(64) NOT NULL,
    age INTEGER NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_master TO PUBLIC;


-- ユーザ興味 & Item Category
CREATE TABLE IF NOT EXISTS user_interest (
    user_id CHAR(64),
    interest_id BIGINT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_interest TO PUBLIC;


-- アイテムマスタ
CREATE TABLE IF NOT EXISTS item_master (
    item_id BIGINT,
    item_name VARCHAR(1024) NOT NULL,
    price FLOAT NOT NULL,
    item_category_id BIGINT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON item_master TO PUBLIC;


-- campaign 
CREATE TABLE IF NOT EXISTS campaign (
    campaign_id BIGINT,
    campaign_name VARCHAR(1024) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign TO PUBLIC;


-- 購買履歴
CREATE TABLE IF NOT EXISTS purchase_history (
    user_id CHAR(64),
    item_id BIGINT,
    campaign_id BIGINT,
    purchase_datetime TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_history TO PUBLIC;

-- 閲覧履歴(GAからのImport)
CREATE TABLE IF NOT EXISTS view_history (
    user_id CHAR(64),
    item_id BIGINT,
    view_datetime TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON view_history TO PUBLIC;
