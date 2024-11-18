import { Construct } from 'constructs';
import * as redshiftserverless from 'aws-cdk-lib/aws-redshiftserverless';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface RedshiftProps {}

export class Redshift extends Construct {
  public readonly workgroupArn: string;
  public readonly workgroupName: string;
  public readonly namespace: string;
  public readonly database: string;
  public readonly rsRole: iam.Role;
  public readonly host: string;

  constructor(scope: Construct, id: string, props: RedshiftProps) {
    super(scope, id);

    const projectname = 'ecsample'; // used for workgroup, namespace, db name, etc
    this.workgroupName = projectname;
    this.database = projectname;
    this.namespace = projectname;

    // role for the Redshift
    this.rsRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('redshift.amazonaws.com')
    });

    // RedShift Credentials
    const secret = new secretsmanager.Secret(this, 'Secret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludeCharacters: '\'"/@ \\'
      }
    });

    // Redshift Serverless namespace
    const ns = new redshiftserverless.CfnNamespace(this, 'Namespace', {
      namespaceName: this.namespace,
      dbName: this.database,
      defaultIamRoleArn: this.rsRole.roleArn,
      adminUsername: 'admin',
      adminUserPassword: secret.secretValueFromJson('password').unsafeUnwrap(), // this is safe
      iamRoles: [this.rsRole.roleArn]
    });

    // Redshift Serverless workgroup
    const workGroup = new redshiftserverless.CfnWorkgroup(this, 'Workgroup', {
      namespaceName: this.namespace,
      workgroupName: this.workgroupName
    });
    this.workgroupArn = workGroup.attrWorkgroupWorkgroupArn;
    workGroup.addDependency(ns);
    this.host = workGroup.attrWorkgroupEndpointAddress;
  }
}
