# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Feature / sms
# iot_feature_api_sms
#
# This feature allows SMS to be used as a mechanism to request and receive provisioning data.
# This lambda is targeted by an instance of Pinpoint to receive specially formatted
# message requests.
#
# It receives the incoming message, which should include a Project and Model (or name) and a unique
# Serial number (in the case of phones, it could be the IMEI). Then it creates a Device of that
# type and sends back the certificates needed.
#
# The system currently doesn't validate the IMEI number against anything, but for a production
# system it can be used to verify that it's a valid IMEI, and that it is associated with the
# right customer project.
#
# The system will return the text-formatted certs back via SMS messages (if size permits).
# If the IMEI is already registered, it will return the certs from the first time it was
# created.
#
# Note that for this to work, we need to attach the proper IAM policies to the lambda so it
# can send/receive SMS messages.

import json
import boto3
from botocore.exceptions import ClientError
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.params import *
from iotapp.logger import *

import time
import os
import pathlib
import uuid
import traceback
import logging
from urllib.parse import urljoin, urlparse


region = os.environ['AWS_REGION']
SIMPLEIOT_IOT_ENDPOINT_KEY = "/simpleiot/iot/endpoint"

logging.basicConfig(level=os.environ.get("IOT_LOGLEVEL", "INFO"))
log = logging.getLogger("simpleiot")

connect_database()

#
# To reset the whole scheme, you can call DELETE, with no parameters. If there is a URL
# in the Model, it will be deleted and the field will be erased so you can start again.
#
def get_system_setting(name):
    result = None

    if name:
        setting = SystemSetting.get(name=name)
        if setting:
            result = setting.value

    ldebug(f"System setting: {name} - result: {result}")
    return result


def reply_via_sms(config, message):
    response = ""

    from_number = config["originationNumber"]
    to_number = config["destinationNumber"]
    keyword = config["messageKeyword"]
    application_id = get_system_setting("pinpoint_application_id")
    sender_id = "simpleiot"

    client = boto3.client('pinpoint', region_name=region)

    # Response goes back to the same device that sent the message
    try:
        response = client.send_messages(
            ApplicationId=application_id,
            MessageRequest={
                'Addresses': {
                    from_number: {
                        'ChannelType': 'SMS'
                    }
                },
                'MessageConfiguration': {
                    'SMSMessage': {
                        'Body': message,
                        'Keyword': keyword,
                        'MessageType': "TRANSACTIONAL",
                        'OriginationNumber': to_number,
                        'SenderId': sender_id
                    }
                }
            }
        )

    except ClientError as e:
        print(e.response['Error']['Message'])
    else:
        print("Message sent! Message ID: "
              + response['MessageResponse']['Result'][destinationNumber]['MessageId'])

    return response


def provision_via_sms(config):
    response = None

    # Payload is assumed to be of the type:
    # simpliot/adm/provision/{customer_id}/{project}/{model}/{serial}
    #

    payload = config["messageBody"]
    payload_parts = payload.split("/")
    action = payload_parts[2]

    if action == "provision":
        customer_id = payload_parts[3]
        project = payload_parts[4]
        model = payload_parts[5]
        serial = payload_parts[6]

        body = {
            "project" : project,
                "model": model,
                "serial": serial
                }
        params = {
            "httpMethod": "POST",
            "body": json.dumps(body)
        }

        lambda_client = boto3.client('lambda')
        invoke_response = lambda_client.invoke(FunctionName="iot_dev_api_device",
                                               InvocationType='RequestResponse',
                                               Payload=json.dumps(params)
                                               )

        response_str = json.loads(invoke_response['Payload'].read().decode())
        response = json.loads(response_str)

        # We need to return the IOT endpoint for this specific ACCOUNT, given the customer_id
        # in the request.
        #
        # ALSO: we need to harden the security so only validated devices are allowed to make
        # this request.
        #
        iot_endpoint = get_param(SIMPLEIOT_IOT_ENDPOINT_KEY)

        result = {
            "st": "ok",
            "ep": iot_endpoint,
            "ca": response["ca_pem"],
            "ct": response["cert_pem"],
            "ky": response["private_key"]
        }
    return response


def lambda_handler(event, context):
    result = ""
    code = 200
    method = ""

    try:
        ev = json.dumps(event, indent=2)
        print(f"SMS received: {ev}")

        record = event["Records"][0]
        source = record["EventSource"]
        sns = record.get("Sns", None)
        if sns:
            message_str = sns["Message"]
            ldebug(f"Message: {messge_str}")

            message = json.loads(message_str)
            response = provision_via_sms(message)
            ldebug(f"Provision response: {response}")
            if response:
                reply_via_sms(message, response)

    except Exception as e:
        payload = {"status": "error", "message": str(e)}
        result = json.dumps(payload)
        code = 500

    response = {
        "isBase64Encoded": False,
        "headers": return_response_headers(method),
        "statusCode": code,
        "body": result
    }

    return response
