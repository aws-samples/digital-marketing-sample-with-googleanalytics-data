import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Database } from './database';
import { Network } from './network';
import { GAImport } from './gaimport';
import { DataLoader } from './dataloader';
import { Redshift } from './redshift';
import { Workflow } from './workflow';
import { Personalize } from './personalize';
import { Pinpoint } from './pinpoint';

export interface AmtGa4PersonalizeStackProps extends cdk.StackProps {
  bqProjectId: string;
  bqDatasetId: string;
}

export class AmtGa4PersonalizeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AmtGa4PersonalizeStackProps) {
    super(scope, id, props);

    const network = new Network(this, 'Network', {});
    const db = new Database(this, 'Database', { vpc: network.vpc });
    const gaimport = new GAImport(this, 'GAImport', {
      bqDatasetId: props.bqDatasetId,
      bqProjectId: props.bqProjectId
    });
    const redshift = new Redshift(this, 'Redshift', {});
    const personalize = new Personalize(this, 'Personalize', {
      vpc: network.vpc,
      redshift: redshift
    });
    const pinpoint = new Pinpoint(this, 'Pinpoint', { vpc: network.vpc, redshift: redshift });
    const dataloader = new DataLoader(this, 'DataLoader', {
      db: db,
      vpc: network.vpc,
      redshift: redshift,
      gaimport: gaimport
    });

    new Workflow(this, 'Workflow', {
      vpc: network.vpc,
      db: db,
      redshift: redshift,
      dataloader: dataloader,
      gaimport: gaimport,
      personalize: personalize,
      pinpoint: pinpoint
    });
  }
}
