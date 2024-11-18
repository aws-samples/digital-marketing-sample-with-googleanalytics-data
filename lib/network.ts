import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

interface NetworkProps {}

// VPC 関連のリソースです
export class Network extends Construct {
  readonly vpc: ec2.Vpc;
  readonly s3vpce: ec2.VpcEndpoint;
  readonly bastionHost: ec2.BastionHostLinux;
  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    // VPC 本体です
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: false
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }
      ]
    });

    new ec2.GatewayVpcEndpoint(this, 'S3VPCE', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      vpc: this.vpc
    });

    // 踏み台
    this.bastionHost = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc: this.vpc,
      requireImdsv2: true,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(300, {
            encrypted: true
          })
        }
      ]
    });
    this.bastionHost.instance.addUserData('amazon-linux-extras install -y postgresql14');
  }
}
