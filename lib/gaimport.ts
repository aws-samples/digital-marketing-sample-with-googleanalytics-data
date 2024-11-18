import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as glue from '@aws-cdk/aws-glue-alpha';

interface GAImportProps {
  bqProjectId: string;
  bqDatasetId: string;
}

// GA/BigQuery からの データを取り込むフローのためのリソースです
export class GAImport extends Construct {
  readonly glueJob: glue.Job;
  readonly bucket: s3.Bucket;
  readonly glueJobArgs: any;
  constructor(scope: Construct, id: string, props: GAImportProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // GCPのサービスアカウント(認証情報)を保存するSecret
    const gcpSecret = new secretsmanager.Secret(this, 'GcpSecret', {});

    // IAM Role for Glue Job
    const glueJobRole = new iam.Role(this, 'GlueJobRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com')
    });

    // Grant permissions to Glue Job Role
    glueJobRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'));
    this.bucket.grantReadWrite(glueJobRole);
    gcpSecret.grantRead(glueJobRole);

    // Glue Connection for BigQuery
    const bigQueryConnection = new glue.Connection(this, 'BigQueryConnection', {
      connectionName: `${cdk.Stack.of(this).stackName.toLowerCase()}-${id.toLowerCase()}-bqconnection`,
      type: new glue.ConnectionType('BIGQUERY'),
      properties: {
        SparkProperties: `{"secretId":"${gcpSecret.secretName}"}`
      }
    });

    // Glue Job
    this.glueJobArgs = {
      '--PROJECT_ID': props.bqProjectId,
      '--DATASET_ID': props.bqDatasetId,
      '--DESTINATION_BUCKET': this.bucket.bucketName,
      '--CONNECTION_NAME': bigQueryConnection.connectionName,
      '--enable-continuous-cloudwatch-log': 'true',
      '--enable-continuous-log-filter': 'true',
      '--enable-metrics': 'true'
    };

    this.glueJob = new glue.Job(this, 'BigQueryToS3GlueJob', {
      role: glueJobRole,
      executable: glue.JobExecutable.pythonEtl({
        glueVersion: glue.GlueVersion.V4_0,
        pythonVersion: glue.PythonVersion.THREE,
        script: glue.Code.fromAsset('gluejob/bqimport/index.py')
      }),
      defaultArguments: this.glueJobArgs,
      connections: [bigQueryConnection],
      maxRetries: 0,
      timeout: cdk.Duration.days(1),
      workerType: glue.WorkerType.STANDARD,
      workerCount: 1
    });
  }
}
