# How to deploy

## 想定環境

- Docker:
- Node.js
- Linux or MacOS

## 0. Google Analytics と BigQuery の設定

[こちら](docs/GA.md) を参考に、Google Analytics と BigQuery の設定を完了し、BigQuery の ProjectId, DatasetId、GCP アクセスのための credential の三つを用意してください。また Dummy の EC Site も用意してください

## 1. パッケージインストール

> [!NOTE]
> このサンプルコードは東京リージョン(ap-northeast-1)での利用のみを想定しています。デフォルトリージョンを別のリージョンに設定している方は、東京リージョンに設定した上でデプロイしてください。

デプロイに必要なパッケージをインストールします。プロジェクトのルート(package.json が存在するディレクトリ)にて下記実行してください。

```bash
npm ci
```

## 2. ECR へのログイン

下記コマンドで Amazon ECR に docker login します

```bash
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
```

## 3. AWS CDK のセットアップ

AWS CDK のセットアップをします。この作業は、AWS アカウントのあるリージョンで初めて AWS CDK を利用する際に必要になります。数分程度で完了します

```bash
npm run cdk bootstrap
```

## 4. AWS CDK の パラメータ設定

[cdk.json](../cdk.json)を開き、下記を設定してください

- bqProjectId: BigQuery の Project Id
- bqDatasetId: BigQuery の Dataset Id

## 5. AWS CDK deploy

下記コマンドにて CDK スタックのデプロイを行います

```bash
npm run cdk -- deploy --require-approval never
```

## 6. BigQuery へのアクセスのための credential 設定

[AWS Secrets Manager のマネジメントコンソール](https://ap-northeast-1.console.aws.amazon.com/secretsmanager/listsecrets?region=ap-northeast-1)を開き、`GAImportGcpSecret`で始まる名前の Secret を開いて、`credentials` キーに GCP のクレデンシャルの文字列が設定されるよう。シークレットの値からプレーンテキストを下記のフォーマットで置き換えてください

```json
{ "credentials": "{GCPのクレデンシャル}" }
```

## 7. Amazon Aurora Database 　への接続情報確認

同じく AWS Secrets Manager のマネジメントコンソールで、`DatabaseAuroraClusterSecret`で始まる名前の Secret を開くと DB の接続情報を取得可能です。こちらを別タブなどで開いた状態にしてください

## 8. Amazon Aurora Database setup

- [Amazon EC2 のマネジメントコンソール](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Instances:instanceState=running)を開き、BastionHost のインスタンスのチェックボックスにチェックをいれ、`Connect` をクリックしてください
  `Session Manager` タブを開いて、`Connect` をクリックしてください。
  BastionHost(踏み台) のターミナルを開くことができます。

- Terminal で下記コマンドを実行し、ec2-user になります

```
sudo su - ec2-user
```

- vim などのエディタで create_tables.sql というテキストを作成し[create_tables.sql](../dbsetup/aurora/create_tables.sql) の内容をコピーしてください

```sh
vim create_tables.sql
```

- 下記のように psql で create_tables.sql を実行してください。<DB の host>および 実行時に聞かれる password は前のセクションで確認した DB 接続情報をコピーしてください。

```sh
psql -h <DBのhost> prototype postgres -f create_tables.sql
```

## 9. Redshift Database setup

[Amazon Redshift Serverless Query editor v2](https://ap-northeast-1.console.aws.amazon.com/sqlworkbench/home?region=ap-northeast-1#/client)を開き、スキーマを `ecsample` に変更した上で [DDL](../dbsetup/rss/create_tables.sql) を実行してください

> [!IMPORTANT]
> 左ペインで `ecssample` 内にテーブルが作成されていることを確認してください

これでデプロイは完了です。[こちら](./TEST.md)を参考にテストしてください
