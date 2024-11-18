#!/bin/bash

# データベース接続情報
DB_NAME="ecdb"
DB_USER="postgres"
DB_HOST="<DBHOST>"
DB_PORT="5432"

# データ投入関数
insert_data() {
    local table=$1
    local file=$2
    echo "Inserting data into $table..."
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\\COPY $table FROM '$file' DELIMITER E'\t'"
}

# 各テーブルにデータを投入
insert_data "interest_master" "interest_master.tsv"
insert_data "user_master" "user_master.tsv"
insert_data "item_master" "item_master.tsv"
insert_data "user_interest" "user_interest.tsv"
insert_data "campaign" "campaign.tsv"
insert_data "purchase_history" "purchase_history.tsv"

echo "Data insertion complete."