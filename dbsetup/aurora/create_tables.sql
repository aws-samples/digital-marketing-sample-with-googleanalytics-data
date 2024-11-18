
CREATE DATABASE ecdb
    LC_COLLATE 'ja_JP.UTF-8'
    LC_CTYPE 'ja_JP.UTF-8'
    TEMPLATE template0;

-- connect
\c ecdb

-- extention
CREATE EXTENSION aws_s3 CASCADE;

-- 興味マスタ
CREATE TABLE IF NOT EXISTS interest_master (
    interest_id BIGSERIAL PRIMARY KEY,
    interest_name TEXT NOT NULL
);

-- ユーザマスタ
CREATE TABLE IF NOT EXISTS user_master (
    user_id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ユーザ興味 & Item category
CREATE TABLE IF NOT EXISTS user_interest (
    user_id UUID REFERENCES user_master(user_id),
    interest_id BIGINT REFERENCES interest_master(interest_id),
    PRIMARY KEY (user_id, interest_id)
);

-- アイテムマスタ
CREATE TABLE IF NOT EXISTS item_master (
    item_id BIGSERIAL PRIMARY KEY,
    item_name TEXT NOT NULL,
    price FLOAT NOT NULL,
    item_category_id BIGINT REFERENCES interest_master(interest_id)
);

-- campaign 
CREATE TABLE IF NOT EXISTS campaign (
    campaign_id BIGSERIAL PRIMARY KEY,
    campaign_name TEXT NOT NULL
);

-- 購買履歴
CREATE TABLE IF NOT EXISTS purchase_history (
    user_id UUID REFERENCES user_master(user_id),
    item_id BIGINT REFERENCES item_master(item_id),
    campaign_id BIGINT REFERENCES campaign(campaign_id),
    purchase_datetime TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (user_id, item_id, purchase_datetime)
);


-- インデックスの作成

-- 1. 過去X日の購買履歴を取得するためのインデックス
CREATE INDEX IF NOT EXISTS idx_purchase_history_datetime ON purchase_history (purchase_datetime);

-- 2. ユーザ興味テーブルのユーザIDに対するインデックス
CREATE INDEX IF NOT EXISTS idx_user_interest_user ON user_interest (user_id);