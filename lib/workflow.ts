import * as cdk from 'aws-cdk-lib';

import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfntasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';

import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Personalize } from './personalize';

import { Database } from './database';
import { Redshift } from './redshift';
import { DataLoader } from './dataloader';
import { GAImport } from './gaimport';
import { Pinpoint } from './pinpoint';

interface WorkflowProps {
  vpc: ec2.IVpc;
  db: Database;
  redshift: Redshift;
  dataloader: DataLoader;
  gaimport: GAImport;
  personalize: Personalize;
  pinpoint: Pinpoint;
}

// StepFunctions の workflow
export class Workflow extends Construct {
  readonly cluster: ecs.Cluster;
  readonly taskDefinition: ecs.TaskDefinition;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    const start = new sfntasks.GlueStartJobRun(this, 'GlueJob', {
      glueJobName: props.gaimport.glueJob.jobName,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      arguments: sfn.TaskInput.fromObject({
        ...props.gaimport.glueJobArgs,
        ...{ '--TEST_DATE': sfn.JsonPath.stringAt('$.targetDate') }
      }),
      resultPath: '$.glueJobResult'
    })
      .next(
        new sfntasks.EcsRunTask(this, 'DataLoader', {
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          cluster: props.dataloader.cluster,
          taskDefinition: props.dataloader.taskDefinition,
          launchTarget: new sfntasks.EcsFargateLaunchTarget({ platformVersion: ecs.FargatePlatformVersion.LATEST }),
          securityGroups: [props.dataloader.securityGroup],
          resultPath: '$.dataloaderResult',
          containerOverrides: [
            {
              containerDefinition: props.dataloader.containerDefinition,
              environment: [
                {
                  name: 'TEST_DATE',
                  value: sfn.JsonPath.stringAt('$.targetDate')
                }
              ]
            }
          ]
        })
      )
      .next(
        new sfntasks.EcsRunTask(this, 'PersonalizeTraining', {
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          cluster: props.personalize.cluster,
          taskDefinition: props.personalize.taskDefinition,
          launchTarget: new sfntasks.EcsFargateLaunchTarget({ platformVersion: ecs.FargatePlatformVersion.LATEST }),
          securityGroups: [props.personalize.securityGroup],
          resultPath: '$.personalizeResult',
          containerOverrides: [
            {
              containerDefinition: props.personalize.containerDefinition,
              environment: [
                {
                  name: 'TEST_DATE',
                  value: sfn.JsonPath.stringAt('$.targetDate')
                }
              ]
            }
          ]
        })
      )
      .next(
        new sfntasks.EcsRunTask(this, 'PinpointSegmentCreation', {
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          cluster: props.pinpoint.cluster,
          taskDefinition: props.pinpoint.taskDefinition,
          launchTarget: new sfntasks.EcsFargateLaunchTarget({ platformVersion: ecs.FargatePlatformVersion.LATEST }),
          securityGroups: [props.pinpoint.securityGroup],
          resultPath: '$.pinpointResult'
        })
      );

    const smachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(start)
    });
    const kicker = new PythonFunction(this, 'Kicker', {
      entry: 'lambda/kicker',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(60),
      environment: {
        STATEMACHINE_ARN: smachine.stateMachineArn
      }
    });
    smachine.grantStartExecution(kicker);
  }
}
