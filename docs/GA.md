# Google Analytics, BigQuery, Dummy EC Site の準備 


## Google Analytics 

[こちら](https://support.google.com/analytics/answer/9304153) などを参考に設定してください。



## Google Analytics と BigQuery の連携

[こちら](https://support.google.com/analytics/answer/9358801?hl=en) などを参考に設定してください。
日次連携で結構です。連携完了したら、Google Analytics でイベントが発生してから一日経過後に BigQuery でデータを閲覧できることを確認してください。
また ProjectId, DatasetId をメモしてください


## BigQuery 認証情報の取得

[こちら](https://docs.aws.amazon.com/ja_jp/glue/latest/dg/aws-glue-programming-etl-connect-bigquery-home.html)を参考にサービスアカウントを設定し、認証情報のjsonをbase64 エンコードした文字列を取得してください。後の手順で Secrets Manager に登録します


## Dummy EC Site のデプロイ

- テスト用に [簡単な EC サイトを模した Web コンテンツ](../test/dummy_ec_site/) を同梱しています。こちらを任意のドメインにデプロイしてください。例えば [AWS Amplify Hosting](https://ap-northeast-1.console.aws.amazon.com/amplify/apps) であれば HTML ファイルをまとめて zip してアップロードするだけでよいので簡単です。

- デプロイ前に各 HTML を編集し、`<GA_ID>` を Google Analytics から発行される Measurement Id の値で置き換えてください。HTML ファイルごとに三箇所ずつ置き換えが必要です

- デプロイが完了したら任意のブラウザでアクセスし、Google Analytics で`view_item`などのイベントが記録されることを確認してください。この際、`uid=<任意のUserId>` というQuery String Parameter を URL に付与すると、その UserId で記録されます