# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: IOT Static Setup
# iot_static_setup
#
from iotapp.iotthing import *
from iotapp.params import *
from iotapp.utils import *
from iotapp.logger import *
import json
import boto3
import cfnresponse
import traceback
import os


SIMPLEIOT_SSM_PARAM_PREFIX = "/simpleiot/iot"
SIMPLEIOT_IOT_INSTALL_DATA_SSM_KEY = f"{SIMPLEIOT_SSM_PARAM_PREFIX}/installdata"
SIMPLEIOT_IOT_RULE_SSM_KEY = f"{SIMPLEIOT_SSM_PARAM_PREFIX}/rules"
SIMPLEIOT_IOT_ENDPOINT_KEY = f"{SIMPLEIOT_SSM_PARAM_PREFIX}/endpoint"

iot = boto3.client('iot')

# This is called by the CDK during initialization and deletion to create/remove static IOT components
# it needs to operate. It operates in two stages, first is to initialilze the static IOT things
# needed by SimpleIOT. The other is to create the IOT rules that route messages around. We need
# to do this in multiple stages because the first stage values generated at runtime will need to be
# fed to Lambdas as environment variables and then the lambda variables need to be defined as
# targets of IOT rules.
#
# Doing it this way breaks the cyclic dependency between IOT and lambda.
# It also means that two custom resources have to be created (and deleted) one for things and another
# for rules. Both, however, will be pointing at this lambda and passing the 'action' parameter
# when invoked.
#
# The actual routines that do the IOT actions are defined in the iotapp layer in iotthing.py.
# They are shared between the CDK and runtime.
#

def handler(event, context):
    code = 200
    lambda_response = ""

    try:
        # This needs to change if there are to be multiple resources
        # in the same stack
        physical_id = 'iot-static-init'

        rp = event['ResourceProperties']
        log_level = rp.get('LogLevel', None)
        logging.basicConfig(level=log_level)

        ldebug(f"iot_static_setup: Input event: {json.dumps(event, indent=4)}")
        requestType = event.get("RequestType", None)
        ldebug(f'Custom request type: {requestType}')

        namespace = rp.get('Namespace', "iot")
        action = rp.get('Action', None)
        uuid = rp.get('Uuid', None)
        name = rp.get('Name', None)
        cert_in_ssm = str2bool(rp.get('CertsInSSM', "False"))
        cert_inline = str2bool(rp.get('CertsInline', "False"))
        stage = rp.get('Stage', None)

        # Check if this is a Create and we're failing Creates
        if requestType == 'Create' and event['ResourceProperties'].get('FailCreate', False):
            raise RuntimeError('Create failure requested')

        result = {}
        attributes = {}
        lambda_response = ""
        result_str = None

        if requestType == 'Create':
            ldebug(f"Creating IOT Thing with prefix: {namespace} and action {action}")
            if action == "initialize":
                result = create_iot_thing(namespace,
                                          name,
                                          uuid,
                                          SIMPLEIOT_SSM_PARAM_PREFIX,
                                          cert_inline,
                                          cert_in_ssm)
                result_str = json.dumps(result, indent=2)
                ldebug(f"IOT Creation: {result_str}")
                endpoint = result["iot_endpoint"]
                create_secret(SIMPLEIOT_IOT_INSTALL_DATA_SSM_KEY, result_str, "SimpleIOT installation IOT settings")
                create_secret(SIMPLEIOT_IOT_ENDPOINT_KEY, endpoint, "IOT Endpoint")
                attributes = {
                    'Response': "ok"
                }

            # elif action == "rule":
            #     rules_json = rp.get('Rules', None)
            #     if not rules_json:
            #         raise RuntimeError('Invalid or missing Rules passed to Create')
            #
            #     rules_list_str = create_iot_rules(rules_json)
            #     ldebug(f"IOT Rule Creation: {rules_list_str}")
            #     create_param(SIMPLEIOT_IOT_RULE_SSM_KEY, rules_list_str, "SimpleIOT IOT Rules")
            # attributes = {
            #     'Response': "ok",
            #     'RuleNames': rules_list_str
            # }

        # NOTE: we ignore the delete event because these are resources we want
        # to stick around after this resource completes.
        #
        elif requestType == 'Delete':
            ldebug(f"Deleting IOT Thing with prefix: {namespace} and action: {action}")
            if action == "initialize":
                install_param_str = get_param(SIMPLEIOT_IOT_INSTALL_DATA_SSM_KEY)
                install_param_data = json.loads(install_param_str)
                delete_iot_thing(install_param_data)
                delete_param(SIMPLEIOT_IOT_INSTALL_DATA_SSM_KEY)
                delete_param(SIMPLEIOT_IOT_ENDPOINT_KEY)

            # elif action == "rule":
            #     rule_param_str = get_param(SIMPLEIOT_IOT_RULE_SSM_KEY)
            #     delete_iot_rules(rule_param_str)
            #     delete_param(SIMPLEIOT_IOT_RULE_SSM_KEY)

            attributes = {
                'Response': "ok"
            }

        lambda_response = json.dumps(attributes)
        ldebug(f"{requestType} Done. Returning with SUCCESS")
        cfnresponse.send(event, context, cfnresponse.SUCCESS, attributes, physical_id)

    except Exception as e:
        lerror(f"Error getting exception processing custom IOT resource: {str(e)}")
        traceback.print_exc()
        cfnresponse.send(event, context, cfnresponse.FAILED, {}, physical_id)
        code = 500

    response_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, AuthorizationToken'
    }

    response = {
        "isBase64Encoded": False,
        "headers": response_headers,
        "statusCode": code,
        "body": lambda_response
    }
    # Use this for testing as a lambda
    #return response
