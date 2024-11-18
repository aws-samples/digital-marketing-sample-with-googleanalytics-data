import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as personalize from 'aws-cdk-lib/aws-personalize';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';

import { Redshift } from './redshift';

interface PersonalizeProps {
  vpc: ec2.Vpc;
  redshift: Redshift;
}

// Personalize のためのリソースです
export class Personalize extends Construct {
  datasetGroup: personalize.CfnDatasetGroup;
  interactionDataset: personalize.CfnDataset;
  itemDataset: personalize.CfnDataset;
  userDataset: personalize.CfnDataset;
  solution: personalize.CfnSolution;
  cluster: ecs.Cluster;
  taskDefinition: ecs.TaskDefinition;
  containerDefinition: ecs.ContainerDefinition;
  securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: PersonalizeProps) {
    super(scope, id);

    this.datasetGroup = new personalize.CfnDatasetGroup(this, 'DSG', {
      name: `${cdk.Stack.of(this).stackName.toLowerCase()}-dsg`,
      domain: 'ECOMMERCE'
    });

    const itemSchema = new personalize.CfnSchema(this, 'Item', {
      name: `${cdk.Stack.of(this).stackName.toLowerCase()}-dsg-item`,
      domain: 'ECOMMERCE',
      schema: JSON.stringify({
        type: 'record',
        name: 'Items',
        namespace: 'com.amazonaws.personalize.schema',
        fields: [
          { name: 'ITEM_ID', type: 'string' },
          { name: 'PRICE', type: 'float' },
          { name: 'CATEGORY_L1', type: ['string'], categorical: true }
        ],
        version: '1.0'
      })
    });

    const userSchema = new personalize.CfnSchema(this, 'User', {
      name: `${cdk.Stack.of(this).stackName.toLowerCase()}-dsg-user`,
      domain: 'ECOMMERCE',
      schema: JSON.stringify({
        type: 'record',
        name: 'Users',
        namespace: 'com.amazonaws.personalize.schema',
        fields: [
          { name: 'USER_ID', type: 'string' },
          { name: 'AGE', type: ['null', 'int'] },
          { name: 'GENDER', type: ['null', 'string'] }
        ],
        version: '1.0'
      })
    });

    const interactionSchema = new personalize.CfnSchema(this, 'Interaction', {
      name: `${cdk.Stack.of(this).stackName.toLowerCase()}-dsg-interaction`,
      domain: 'ECOMMERCE',
      schema: JSON.stringify({
        type: 'record',
        name: 'Interactions',
        namespace: 'com.amazonaws.personalize.schema',
        fields: [
          { name: 'USER_ID', type: 'string' },
          { name: 'ITEM_ID', type: 'string' },
          { name: 'TIMESTAMP', type: 'long' },
          { name: 'EVENT_TYPE', type: 'string' }
        ],
        version: '1.0'
      })
    });

    // Create Datasets
    this.itemDataset = new personalize.CfnDataset(this, 'ItemDataset', {
      datasetGroupArn: this.datasetGroup.attrDatasetGroupArn,
      datasetType: 'Items',
      name: 'ItemDataset',
      schemaArn: itemSchema.attrSchemaArn
    });

    this.userDataset = new personalize.CfnDataset(this, 'UserDataset', {
      datasetGroupArn: this.datasetGroup.attrDatasetGroupArn,
      datasetType: 'Users',
      name: 'UserDataset',
      schemaArn: userSchema.attrSchemaArn
    });

    this.interactionDataset = new personalize.CfnDataset(this, 'InteractionDataset', {
      datasetGroupArn: this.datasetGroup.attrDatasetGroupArn,
      datasetType: 'Interactions',
      name: 'InteractionDataset',
      schemaArn: interactionSchema.attrSchemaArn
    });

    this.genTrainingFlow(props);
  }

  genTrainingFlow(props: PersonalizeProps) {
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
        actions: [
          'personalize:UpdateRecommender',
          'personalize:DescribeRecommender',
          'personalize:ListRecommenders',
          'personalize:CreateRecommender',
          'personalize:CreateDatasetImportJob',
          'personalize:DescribeDatasetImportJob'
        ],
        resources: ['*']
      })
    );

    const personalizeRole = new iam.Role(this, 'PersonalizeRole', {
      assumedBy: new iam.ServicePrincipal('personalize.amazonaws.com')
    });
    personalizeRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['personalize:CreateDatasetImportJob'],
        resources: ['*']
      })
    );
    personalizeRole.grantPassRole(this.taskDefinition.taskRole);
    bucket.grantReadWrite(personalizeRole);
    bucket.grantReadWrite(this.taskDefinition.taskRole);
    bucket.grantDelete(this.taskDefinition.taskRole);
    bucket.grantReadWrite(props.redshift.rsRole);
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('personalize.amazonaws.com')],
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [bucket.bucketArn, bucket.arnForObjects('*')]
      })
    );

    const asset = new DockerImageAsset(this, 'DockerImage', {
      directory: path.join(__dirname, '..', 'personalize'),
      platform: Platform.LINUX_AMD64
    });
    const containerName = `${cdk.Stack.of(this).stackName}-personalize-training`;
    this.containerDefinition = this.taskDefinition.addContainer('Container', {
      containerName: containerName,
      image: ecs.AssetImage.fromDockerImageAsset(asset),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: `${cdk.Stack.of(this).stackName}-personalize-training`
      }),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        REDSHIFT_ROLE_ARN: props.redshift.rsRole.roleArn,
        REDSHIFT_DATABASENAME: props.redshift.database,
        REDSHIFT_WORKGROUP: props.redshift.workgroupName,
        PERSONALIZE_ROLE_ARN: personalizeRole.roleArn,
        PERSONALIZE_INTERACTION_DATASET: this.interactionDataset.attrDatasetArn,
        PERSONALIZE_DSG: this.datasetGroup.attrDatasetGroupArn,
        PERSONALIZE_ITEM_DATASET: this.itemDataset.attrDatasetArn,
        PERSONALIZE_USER_DATASET: this.userDataset.attrDatasetArn,
        PERSONALIZE_RECOMMENDER_NAME: `${cdk.Stack.of(this).stackName.toLowerCase()}-recommender`
      }
    });
  }
}
