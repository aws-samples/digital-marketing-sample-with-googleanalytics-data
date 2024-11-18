import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pinpoint from 'aws-cdk-lib/aws-pinpoint';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Redshift } from './redshift';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';

interface PinpointProps {
  vpc: ec2.Vpc;
  redshift: Redshift;
}

// Pinpoint
export class Pinpoint extends Construct {
  cluster: ecs.Cluster;
  taskDefinition: ecs.TaskDefinition;
  securityGroup: ec2.SecurityGroup;
  constructor(scope: Construct, id: string, props: PinpointProps) {
    super(scope, id);

    const cfnEmailTemplate = new pinpoint.CfnEmailTemplate(this, 'MyCfnEmailTemplate', {
      subject: 'AMTテスト: {{User.UserId}} さんへお得なメール',
      templateName: 'templateName',
      htmlPart: '{{Attributes.age}} 歳の {{User.UserId}} さんへお得な情報のお知らせです。',
      textPart: 'お得な情報メール'
    });

    const app = new pinpoint.CfnApp(this, 'App', { name: `${cdk.Stack.of(this).stackName}-project` });
    this.genSegmentImportFlow(props, app.ref);
  }

  genSegmentImportFlow(props: PinpointProps, appId: string) {
    // training
    const bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

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
    this.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'redshift-serverless:GetCredentials',
          'redshift-data:BatchExecuteStatement',
          'redshift-data:ExecuteStatement',
          'redshift-data:GetStatementResult',
          'redshift-data:DescribeStatement'
        ],
        resources: ['*']
      })
    );
    this.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['mobiletargeting:CreateImportJob', 'mobiletargeting:CreateSegment', 'mobiletargeting:GetImportJob'],
        resources: ['*']
      })
    );

    const pinpointRole = new iam.Role(this, 'PinpointRole', {
      assumedBy: new iam.ServicePrincipal('pinpoint.amazonaws.com')
    });
    pinpointRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['mobiletargeting:CreateImportJob', 'mobiletargeting:CreateSegment', 'mobiletargeting:GetImportJob'],
        resources: ['*']
      })
    );
    pinpointRole.grantPassRole(this.taskDefinition.taskRole);
    bucket.grantReadWrite(pinpointRole);
    bucket.grantReadWrite(this.taskDefinition.taskRole);
    bucket.grantDelete(this.taskDefinition.taskRole);
    bucket.grantReadWrite(props.redshift.rsRole);

    const asset = new DockerImageAsset(this, 'DockerImage', {
      directory: path.join(__dirname, '..', 'pinpoint'),
      platform: Platform.LINUX_AMD64
    });
    const containerName = `${cdk.Stack.of(this).stackName}-pinpoint-createsegment`;
    this.taskDefinition.addContainer('Container', {
      containerName: containerName,
      image: ecs.AssetImage.fromDockerImageAsset(asset),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: `${cdk.Stack.of(this).stackName}-pinpoint-createsegment`
      }),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        REDSHIFT_ROLE_ARN: props.redshift.rsRole.roleArn,
        REDSHIFT_DATABASENAME: props.redshift.database,
        REDSHIFT_WORKGROUP: props.redshift.workgroupName,
        PINPOINT_ROLE_ARN: pinpointRole.roleArn,
        PINPOINT_APP_ID: appId
      }
    });
  }
}
