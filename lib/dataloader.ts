import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as path from 'path';

import * as iam from 'aws-cdk-lib/aws-iam';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';

import { Database } from './database';
import { Redshift } from './redshift';
import { GAImport } from './gaimport';

interface DataLoaderProps {
  vpc: ec2.IVpc;
  db: Database;
  redshift: Redshift;
  gaimport: GAImport;
}

// Aurora, S3 から Redshift へのデータ投入ジョブ関連のリソースです
export class DataLoader extends Construct {
  readonly cluster: ecs.Cluster;
  readonly taskDefinition: ecs.TaskDefinition;
  readonly containerDefinition: ecs.ContainerDefinition;
  readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataLoaderProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });
    bucket.grantReadWrite(props.db.s3ExportRole);
    bucket.grantRead(props.redshift.rsRole);

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsights: true
    });

    this.securityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true
    });
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 4096,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      },
      executionRole: new iam.Role(this, 'TaskExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
      })
    });

    this.taskDefinition.executionRole!.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*']
      })
    );

    bucket.grantReadWrite(this.taskDefinition.taskRole);
    props.gaimport.bucket.grantRead(this.taskDefinition.taskRole);
    this.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['redshift-data:GetStatementResult', 'redshift-data:DescribeStatement'],
        resources: ['*']
      })
    );
    this.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'redshift-serverless:GetCredentials',
          'redshift-data:BatchExecuteStatement',
          'redshift-data:ExecuteStatement'
        ],
        resources: ['*']
      })
    );

    const asset = new DockerImageAsset(this, 'DockerImage', {
      directory: path.join(__dirname, '..', 'dataloader'),
      platform: Platform.LINUX_AMD64
    });
    const containerName = `${cdk.Stack.of(this).stackName}-loader-container`;
    this.containerDefinition = this.taskDefinition.addContainer('Container', {
      containerName: containerName,
      image: ecs.AssetImage.fromDockerImageAsset(asset),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: `${cdk.Stack.of(this).stackName}-loader`
      }),
      environment: {
        TMP_BUCKET_NAME: bucket.bucketName,
        GA_BUCKET_NAME: props.gaimport.bucket.bucketName,
        REDSHIFT_ROLE_ARN: props.redshift.rsRole.roleArn,
        REDSHIFT_DATABASENAME: props.redshift.database,
        REDSHIFT_WORKGROUP: props.redshift.workgroupName,
        ...props.db.getEnvs()
      }
    });

    bucket.grantReadWrite(this.taskDefinition.taskRole);
    props.db.secret.grantRead(this.taskDefinition.taskRole);
  }
}
