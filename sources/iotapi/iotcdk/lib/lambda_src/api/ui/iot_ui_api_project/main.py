# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: UI Project
# iot_ui_api_project
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.logger import *
import os


connect_database()


def format_one(rec, maxdata=True):
    total_device_count = 0

    return_data = {
        "id": rec.id.hex,
        "project": rec.name,
    }
    if maxdata:
        if rec.models:
            model_list = []
            for model in rec.models:
                device_count = count(d for d in Device if d.model == model)
                total_device_count += device_count
                model_data = {
                    "model": model.name,
                    "desc": model.desc,
                    "id": model.id.hex,
                    "image": model.image_url,
                    "device_count": device_count
                }
                if model.date_created:
                    model_data['date_created'] = model.date_created.isoformat()
                if model.date_created:
                    model_data['last_modified'] = model.last_modified.isoformat()
                model_list.append(model_data)

            return_data['models'] = model_list
        # if rec.devices:
        #     device_list = []
        #     for device in rec.devices:
        #         device_list.append(device.serial_number)
        #     return_data['devices'] = device_list
    if rec.desc:
        return_data['desc'] = rec.desc
    if rec.date_created:
        return_data['date_created'] = rec.date_created.isoformat()
    if rec.last_modified:
        return_data['last_modified'] = rec.last_modified.isoformat()

    return_data["total_device_count"] = total_device_count

    return return_data

# This is used to format all the data -- assumes there's a local format_one method in the current
# object.
#
def format_all(recs):
    return_data = {}
    projects = []
    ldebug(f"Format all")

    org_name = SystemSetting.select(lambda s: s.name == "org_name").first().value
    org_logo = SystemSetting.select(lambda s: s.name == "org_logo").first().value
    default_model_icon = SystemSetting.select(lambda s: s.name == "default_model_icon").first().value
    dashboard_domain = SystemSetting.select(lambda s: s.name == "dashboardDomainName").first().value

    # ldebug(f"Org: {org_name} - Logo: {org_logo} - Default Icon: {default_model_icon} - Domain: {dashboard_domain}")

    return_data["org_name"] = str(org_name)
    return_data["org_logo"] = str(org_logo)
    return_data["default_model_icon"] = str(default_model_icon)
    # ldebug(f"Dashboard domain: {dashboard_domain}")

    for rec in recs:
        total_device_count = 0
        max_models_to_return = 3
        one = format_one(rec, False)
        model_count = count(rec.models)
        one['total_model_count'] = model_count

        if model_count > 0:
            model_list = []

            for model in rec.models:
                device_count = count(d for d in Device if d.model == model)
                total_device_count += device_count
                if max_models_to_return > 0:
                    image = model.image_url if model.image_url else default_model_icon
                    image_url = os.path.join(dashboard_domain, image)
                    one_model = {"name": model.name,
                                  "image": image_url,
                                  "id": model.id.hex,
                                  "device_count": device_count
                                 }
                    if model.date_created:
                        one_model['date_created'] = model.date_created.isoformat()
                    if model.date_created:
                        one_model['last_modified'] = model.last_modified.isoformat()
                    model_list.append(one_model)
                    max_models_to_return -= 1

            one['models'] = model_list
            one["total_device_count"] = total_device_count

        projects.append(one)

    return_data["projects"] = projects

    return return_data


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
        project = None

        if params:
            pagenum = params.get("pagenum", 1)
            pagesize = params.get("pagesize", 999999)

            project = find_project(params)
            if project:
                result = format_one(project)
            else:
                if params.get("all", None):
                    ldebug("Getting ALL records")
                    projects = Project.select().order_by(Project.date_created).page(int(pagenum), int(pagesize))
                    ldebug(f"Got {len(projects)} records")
                    result = format_all(projects)
                else:
                    code = 418
                    result = {"status": "error", "message": "project not found"}

    except Exception as e:
        lerror(f"Error getting Project: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    ldebug(f"Returning result: {result}")
    return code, json.dumps(result, indent=4)


def lambda_handler(event, context):
    result = ""
    code = 404
    method = ""

    try:
        method = event["httpMethod"]
        ldebug(f"METHOD: {method}")

        if method == "GET":
            params = event.get("queryStringParameters", None)
            code, result = get_record(params)

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
