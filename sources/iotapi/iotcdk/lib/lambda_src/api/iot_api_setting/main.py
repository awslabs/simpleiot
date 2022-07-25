# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: settings
# iot_api_settings
#
# System and project settings
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.logger import *
import os
import traceback


connect_database()


def format_one(rec, is_project):
    # v = json.dumps(rec, indent=4)
    # print(f"Record: \n{v}")
    print(f"Rec: {rec}")

    return_data = {
        "id": rec.id.hex,
        "name": rec.name,
        "value": rec.value
    }

    if rec.desc:
        return_data['desc'] = rec.desc
    if is_project:
        return_data['project'] = rec.project.name

    if rec.date_created:
        return_data['date_created'] = rec.date_created.isoformat()
    if rec.last_modified:
        return_data['last_modified'] = rec.last_modified.isoformat()
    return return_data


# This is used to format all the data -- assumes there's a local format_one method in the current
# object.
#
def format_all(recs, is_project):
    return_data = []
    for rec in recs:
        one = format_one(rec, is_project)
        return_data.append(one)
    return return_data


# If a project is specified, we put values into project settings.
# If not, they go into system settings.
@db_session
def add_record(params):
    code = 200
    result = {}

    try:
        name = params.get("name", "")
        value = params.get("value", "")
        desc = params.get("desc", "")

        project = find_project(params)
        if project:
            setting = Setting(project=project,
                              name=name,
                              value=value,
                              desc=desc)
        else:
            setting = SystemSetting(name=name,
                              value=value,
                              desc=desc)
        commit()
        result = {"status": "ok", "id": setting.id.hex}
    except Exception as e:
        lerror(f"Error creating Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

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
    name = None

    try:
        project = None

        if params:
            name = params.get("name", None)

        project = find_project(params)
        if project:
            if name:
                ldebug("Getting one project setting")
                one_project_settings = Setting.get(lambda s: s.project == project and
                                                      s.name== name)
                code = 200
                result = format_one(one_project_settings, True)
            else:
                ldebug("Getting all project settings")
                all_project_setting = Setting.select(lambda s: s.project == project)
                code = 200
                result = format_all(all_project_setting, True)
        else:
            if name:
                ldebug("Getting one system setting")
                one_system_settings = SystemSetting.get(lambda s: s.name == name)
                code = 200
                result = format_one(one_system_settings, False)
            else:
                ldebug("Getting all system settings")
                all_system_setting = SystemSetting.select().order_by(SystemSetting.name)
                code = 200
                result = format_all(all_system_setting, False)

    except Exception as e:
        lerror(f"Error Getting Setting: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    print(f"Returning result: {result}")
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
