import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';

interface DatabaseProps {
  vpc: ec2.IVpc;
}

// Aurora DB 関連のリソースです
export class Database extends Construct {
  readonly dbCluster: rds.DatabaseCluster;
  readonly dbname: string;
  readonly secret: ISecret;
  readonly s3ExportRole: iam.Role;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const rdssg = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc
    });
    rdssg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(5432));
    this.s3ExportRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com')
    });
    const paramGroup = new rds.ParameterGroup(this, 'AuroraParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_1
      }),
      parameters: {
        timezone: 'Asia/Tokyo'
        // password_encryption: 'md5', // QuickSightからの接続が必要な場合は md5 ?
      }
    });

    this.dbname = 'ecdb';
    this.dbCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_1
      }),
      defaultDatabaseName: 'prototype',
      parameterGroup: paramGroup,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1
      }),
      s3ExportRole: this.s3ExportRole,
      serverlessV2MaxCapacity: 8,
      serverlessV2MinCapacity: 1,
      enableDataApi: true,
      securityGroups: [rdssg],
      storageEncrypted: true,
      cloudwatchLogsExports: ['postgresql'],
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    this.secret = this.dbCluster.secret!;
  }

  getEnvs() {
    return {
      DB_HOSTNAME: this.dbCluster.clusterEndpoint.hostname,
      DB_PORT: '5432',
      DB_NAME: this.dbname,
      DB_SECRET_NAME: this.secret.secretName
    };
  }
}
