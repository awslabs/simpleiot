# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: featuremanager
# iot_api_featuremanager
#
# Feature management - actual feature API is under api/feature/...
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.logger import *
import os
import traceback


connect_database()


def format_one(rec):
    return_data = {
        "id": rec.id.hex,
        # "template": rec.name,
    }

    # if rec.desc:
    #     return_data['desc'] = rec.desc
    # if rec.display_name:
    #     return_data['display_name'] = rec.display_name
    # if rec.revision:
    #     return_data['revision'] = rec.revision
    # if rec.image_url:
    #     return_data['image'] = rec.image_url
    # if rec.icon_url:
    #     return_data['icon'] = rec.icon_url
    # if rec.date_created:
    #     return_data['date_created'] = rec.date_created.isoformat()
    # if rec.last_modified:
    #     return_data['last_modified'] = rec.last_modified.isoformat()
    return return_data


# This is used to format all the data -- assumes there's a local format_one method in the current
# object.
#
def format_all(recs):
    return_data = []
    for rec in recs:
        one = format_one(rec)
        return_data.append(one)
    return return_data


@db_session
def add_record(params):
    code = 200
    result = {}

    # try:
    #     project = find_project(params)
    #     if project:
    #         name = params.get("name", "")
    #         desc = params.get("desc", "")
    #         revision = params.get("revision", "")
    #         display_name = params.get("display_name", "")
    #         display_order = params.get("display_order", 0)
    #         image_url = params.get("image", "")
    #         icon_url = params.get("icon", "")
    #         position = params.get("require_position", False)
    #         gateway = params.get("gateway", False)
    #
    #         model_type_str = params.get("type", "device")
    #         model_type = enum_from_str(ModelType, model_type_str)
    #
    #         model_protocol_str = params.get("protocol", "mqtt")
    #         model_protocol = enum_from_str(ModelProtocol, model_protocol_str)
    #
    #         model_connection_str = params.get("connection", "direct")
    #         model_connection = enum_from_str(ModelConnection, model_connection_str)
    #
    #         model_ml_str = params.get("ml", "none")
    #         model_ml = enum_from_str(ModelML, model_ml_str)
    #
    #         model_security_str = params.get("security", ModelSecurity.DEVICE.value)
    #         model_security = enum_from_str(ModelSecurity, model_security_str)
    #
    #         model_storage_str = params.get("storage", ModelStorage.NONE.value)
    #         model_storage = enum_from_str(ModelStorage, model_storage_str)
    #
    #         hw_version = params.get("hw_version", "")
    #
    #         model = Model(model_project=project,
    #                             name=name,
    #                             desc=desc,
    #                             revision=revision,
    #                             display_name=display_name,
    #                             display_order=display_order,
    #                             image_url=image_url,
    #                             icon_url=icon_url,
    #                             require_position=position,
    #                             is_gateway=gateway,
    #                             model_type=model_type,
    #                             model_protocol=model_protocol,
    #                             model_connection=model_connection,
    #                             model_ml=model_ml,
    #                             model_security=model_security,
    #                             model_storage=model_storage,
    #                             hw_version=hw_version
    #                             )
    #         commit()
    #         result = {"status": "ok", "id": model.id.hex}
    #     else:
    #         code = 418
    #         result = {"status": "error", "message": "Project could not be created. Invalid project"}
    # except Exception as e:
    #     lerror(f"Error creating Model: {str(e)}")
    #     code = 500
    #     result = {"status": "error", "message": str(e)}
    #     traceback.print_exc()

    return code, json.dumps(result)


@db_session
def get_record(params):
    """
    Called with the GET REST call to retrieve one or more records.
    :param params:
    :return:
    """

    code = 200
    result = {}
    try:
    # model = None
    #     project = None
    #
    #     if params:
    #         project = find_project(params)
    #         if project:
    #             model = find_model(params, project)
    #             if model:
    #                 ldebug(f"Got model: {model.name}")
    #                 result = format_one(model)
    #             else:
    #                 if params.get("all", None):
    #                     all_models = Model.select(lambda m: m.model_project == project).order_by(
    #                         Model.date_created)
    #                     code = 200
    #                     result = format_all(all_models)
    #                 else:
    #                     code = 418
    #                     result = {"status": "error", "message": "Can not find model"}
    #
    #         else:
    #             code = 404
    #             result = {"status": "error", "message": "Can not find project"}
    #
    # except Exception as e:
    #     lerror(f"Error Getting Model: {str(e)}")
    #     code = 500
    #     result = {"status": "error", "message": str(e)}
    #     traceback.print_exc()
    #
    return code, json.dumps(result)


@db_session
def modify_record(params):
    """
    Called with the PUT REST call to modify an existing record. NOTE that we are going to sanity check
    the params, as well as make sure no devices of this type exist for certain types of changes. If so,
    the error message will have to indicate that this field can not be changed.
    :param params:
    :return:
    """
    code = 200
    result = {}
    return code, json.dumps(result)


@db_session
def delete_record(params):
    """
    Called with the DELETE REST call to remove a record.

    :param params:
    :return:
    """
    code = 200
    result = {}
    # try:
    #     if params:
    #         project = find_project(params)
    #         if project:
    #             model = find_model(params, project)
    #             if model:
    #                 model_id = model.id.hex
    #                 model.delete()
    #                 commit()
    #                 result = {"status": "ok", "id": model_id}
    #                 code = 200
    #             else:
    #                 code = 418
    #                 result = {"status": "error", "message": "Model record not found"}
    #         else:
    #             code = 418
    #             result = {"status": "error", "message": "Project not found"}
    # except Exception as e:
    #     lerror(f"Error deleting Model: {str(e)}")
    #     code = 500
    #     result = {"status": "error", "message": str(e)}

    return code, json.dumps(result)


def lambda_handler(event, context):
    result = ""
    code = 200
    method = ""

    try:
        method = event["httpMethod"]

        if method == "POST":
            body = event["body"]
            payload = json.loads(body)
            code, result = add_record(payload)
        elif method == "GET":
            params = event.get("queryStringParameters", None)
            code, result = get_record(params)
        elif method == "PUT":
            params = event.get("queryStringParameters", None)
            code, result = modify_record(params)
        elif method == "DELETE":
            params = event.get("queryStringParameters", None)
            code, result = delete_record(params)

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
