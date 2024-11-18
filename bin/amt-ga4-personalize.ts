#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AmtGa4PersonalizeStack } from '../lib/amt-ga4-personalize-stack';

const app = new cdk.App();

const bqDatasetId = app.node.tryGetContext('bqDatasetId');
const bqProjectId = app.node.tryGetContext('bqProjectId');
new AmtGa4PersonalizeStack(app, 'AmtGa4PersonalizeStack', {
  bqProjectId: bqProjectId,
  bqDatasetId: bqDatasetId
});
