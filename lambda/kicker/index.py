import boto3
import os
import json
from datetime import datetime, timedelta, timezone


JST = timezone(timedelta(hours=+9), "JST")
STATEMACHINE_ARN = os.environ["STATEMACHINE_ARN"]
stepfunctions = boto3.client("stepfunctions")


def process(target_date):
    stepfunctions.start_execution(stateMachineArn=STATEMACHINE_ARN, input=json.dumps({"targetDate": target_date}))


def handler(event, context):
    # eventで指定された場合はその日付、されなかった場合には前日の日付を対象とする
    target_date = event.get("targetDate")
    if not target_date:
        tomorrow = datetime.now(JST).date() - timedelta(days=1)
        target_date = tomorrow.strftime("%Y%m%d")

    process(target_date)
