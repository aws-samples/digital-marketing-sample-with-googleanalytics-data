# Test 


## 1. テストデータの生成と投入

* BastionHost(踏み台) にて[テストデータ生成スクリプト](../test/gen_auroratestdata.py)を実行してください

``` bash
python3 gen_auroratestdata.py
```

* [テストデータ投入スクリプト](../test/insert_dummy.sh) を編集し、<DBHOST> を実際の Amazon Aurora の Host に設定してから実行してください

``` bash
bash insert_dummy.sh
```

※ 実行までに .pgpass をあらかじめ作成しておくと Amazon Aurora の認証 がスムースです


## 2. Dummy の EC site へアクセス

[こちら](./GA.md)でデプロイした Dummy の EC サイトへ任意のブラウザでアクセスし、アイテムを閲覧してください。この際、 URL の QueryString に`uid=<任意のUserId>` を付与することで、Google Analytics にその UserId の行動として記録されます。Amazon Personalize では学習のために最低25人のユーザが必要であるため、25人分以上のユーザの行動を実施してください。また全体で1000イベント必要です。UserId の値は任意ですが、データベースの user_master テーブルにある user_id と合致させる必要があります


## 3. Google Analytics および BigQuery での記録を確認

Google Analytics でユーザの行動が記録されることを確認してください。問題なければ翌日まで待ち、BigQuery に データが格納されていることを確認してください


## 4. ワークフローの実行

[AWS Lambda のマネジメントコンソール](https://ap-northeast-1.console.aws.amazon.com/lambda/home?region=ap-northeast-1#/functions) を開き、`WorkflowKicker`が名前に含まれる 関数 を開いて `Test` から実行してください。パラメータは不要です。これにより、AWS StepFunctions が起動し下記が順に実行されます

- AWS Glue により 昨日分のデータが BigQuery から Amazon S3 に連携され、Amazon Redshift に LOAD されます
- Amazon Aurora から Amazon Redshift にデータが LOAD されます
- Amazon Personalize にて Amazon Redshift のデータを使って学習し、Recommender を作成します
- Amazon Pinpoint にて Amazon Redshift のユーザデータをセグメントとしてインポートします


## 5. Amazon Personalize でレコメンドの実行

例えば AWS CLI を用いて下記のように実行可能です

``` bash
aws personalize-runtime get-recommendations --recommender-arn <recommenderのarn>  --user-id <user_id> --item-id <item_id>  
```

## 6. Amazon Pinpoint でセグメント編集とキャンペーン実行

[Amazon Pinpoint のマネジメントコンソール](https://ap-northeast-1.console.aws.amazon.com/pinpoint/home?region=ap-northeast-1#/apps)を開いてプロジェクトを開き、作成されたセグメントを用いてマーケティングアクションを実行してください
