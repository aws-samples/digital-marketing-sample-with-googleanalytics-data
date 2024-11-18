# README 

これは 自社データと Google Analytics のデータを連携し、Amazon Personalize によるレコメンドや Amazon Pinpoint によるセグメント抽出などのデジタルマーケティングアクションを行うためのプラットフォーム実装サンプルです

- Google Analytics / BigQuery のデータを AWS Glue でインポートし、Amazon Redshift にロードします
- ダミーのテスト用 EC サイト上でのユーザの"商品閲覧行動" を Google Analytics で計測し、自社データベースのユーザマスタやアイテムマスタと JOIN してレコメンドを生成します
- 自社データベースのユーザマスタを Amazon Pinpoint にセグメントとして抽出します

## セットアップ手順等

- [Google Analytics 設定](docs/GA.md)
- [システムのデプロイ](docs/DEPLOYMENT.md)
- [動作確認](docs/TEST.md)
- [注意点](docs/NOTE.md)

# アーキテクチャ

![arch](docs/imgs/architecture.png)

## データ取り込みの AWS StepFunctions
![alt text](docs/imgs/stepfn.png)

### dataloader

以下のスクリプト(`dataloader.py`)を Amazon ECS RunTaskで稼働させることで、Aurora PostgreSQL→Amazon S3 の CSV Export、Amazon S3→Amazon Redshift Serverless（GA4のデータ含め）データ取り込みを行っている。

ファイル構成  
```
dataloader/
├── Dockerfile
├── dataloader.py
├── db.py
├── dumpsql
│   ├── dump_campaign.sql
│   ├── dump_interest_master.sql
│   ├── dump_item_master.sql
│   ├── dump_purchase_history.sql
│   ├── dump_user_interest.sql
│   └── dump_user_master.sql
├── galoadsql
│   └── load_view_history.sql
├── loadsql
│   ├── load_campaign.sql
│   ├── load_interest_master.sql
│   ├── load_item_master.sql
│   ├── load_purchase_history.sql
│   ├── load_user_interest.sql
│   └── load_user_master.sql
└── requirements.txt
```

- `dumpsql` の中に、Amazon Aurora PostgreSQL→Amazon S3の CSV Export を [aws_s3.query_export_to_s3](https://docs.aws.amazon.com/ja_jp/AmazonRDS/latest/AuroraUserGuide/postgresql-s3-export.html) を利用して実行するクエリが格納  
  - Amazon Aurora MySQL の場合は、[SELECT INTO OUTFILE S3](https://docs.aws.amazon.com/ja_jp/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Integrating.SaveIntoS3.html)
- `loadsql` の中に、Amazon S3→Amazon Redshift ServerlessをCOPY句とMERGE句を利用して取り込むクエリが格納

### Glue - bqimport

`bqimport/index.py` に [Glue Connector for BigQuery](https://aws.amazon.com/marketplace/pp/prodview-w2ranrogj3xmm)を利用して AWS Glue にてBigQueryからデータを取り込み、Amazon S3に書き出すスクリプトが記述されている
