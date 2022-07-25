# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Device
# iot_api_device
#
import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.logger import *
import os
import traceback

ldebug("Importing iot module")
from iotapp.iotthing import *

ldebug("Importing gg module")
from iotapp.iotgg import *

DEFAULT_REGION = os.getenv("AWS_REGION")
region = os.environ['AWS_REGION']
prefix = os.environ['PREFIX']
stage = os.environ['STAGE']

connect_database()


def format_device(project, model, dev, detail=False):
    return_data = {
        "id": dev.id.hex,
        "serial": dev.serial_number,
    }

    project_data = format_project(project)
    if project_data:
        return_data["project"] = project_data

    model_data = format_model(model)
    if model_data:
        return_data["model"] = model_data

    if dev.name:
        return_data['name'] = dev.name
    if dev.desc:
        return_data['desc'] = dev.desc

    if detail:
        return_data['installed'] = dev.installed
        return_data['error_message'] = dev.error_message
        return_data['position'] = dev.position
        return_data['lat'] = dev.geo_lat
        return_data['lng'] = dev.geo_lng
        return_data['alt'] = dev.geo_alt
        return_data['on_power'] = dev.on_power
        return_data['battery_level'] = dev.battery_level
        if dev.gateway:
            gateway = dev.gateway
            return_data['gateway_id'] = gateway.id.hex
        if dev.date_manufactured:
            return_data['date_manufactured'] = dev.date_manufactured.isoformat()

        device_data = []
        data_items = Data.select(lambda d: d.device == dev)
        return_data['data_count'] = count(data_items)
        if count(data_items) > 0:
            device_data = format_device_data(data_items)

        return_data['datatype'] = device_data

    if dev.date_created:
        return_data['date_created'] = dev.date_created.isoformat()
    return return_data

def format_project(project):
    project_data = None
    if project:
        project_data = {
            "id": project.id.hex,
            "name": project.name,
            "desc": project.desc
        }
    return project_data

def format_model(model):
    model_data = None
    if model:
        model_data = {
            "id": model.id.hex,
            "name": model.name,
            "desc": model.desc,
            "revision": model.revision,
            "display_name": model.display_name,
            "display_order": model.display_order,
            "image": model.image_url,
            "icon": model.icon_url,
            "has_digital_twin": model.has_digital_twin,
            "has_location_tracking": model.has_location_tracking,
            "has_alexa": model.has_alexa,
            "requires_power": model.requires_power,
            "requires_battery": model.requires_battery,
        }
    return model_data

def format_one_device_data(data):
    type = data.type
    return_data = {
        "id": data.id.hex,
        "udi": data.udi,
        "name": type.name,
        "value": data.value,
        "position": data.position,
        "dimension": data.dimension,
        "type": type.data_type,
        "units": type.units,
        "allow_modify": type.allow_modify,
        "show_on_twin": type.show_on_twin,
        "data_position": type.data_position,
        "data_normal": type.data_normal,
        "label_template": type.label_template,
        "ranges": type.ranges,
        "timestamp":  data.timestamp.isoformat()
    }
    return return_data

def format_device_data(data_items):
    return_data = []
    for data in data_items:
        data_value = format_one_device_data(data)
        return_data.append(data_value)
    return return_data


# This is used to format all the data -- assumes there's a local format_one method in the current
# object.
#
def format_all(project, model, devices, total_devices):
    return_data = {}
    project_data = format_project(project)
    if project_data:
        return_data["project"] = project_data

    # NOTE: if we have a model  passed to us, we process it and put it at the top
    # response level. However, if one hasn't been passed to us, we include
    # the model data in each individual device record being returned.
    #
    model_data = format_model(model)
    if model_data:
        return_data["model"] = model_data
        model = None # zap it so format_device doesn't include model data for each device.

    return_data["total_devices"] = total_devices
    all_devices = []
    for device in devices:
        one = format_device(None, model, device, False)
        all_devices.append(one)
    return_data["devices"] = all_devices

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
        device = None
        project = None

        pagenum = params.get("pagenum", 1)
        pagesize = params.get("pagesize", 9999999)

        if params:
            project = find_project(params)
            model = None
            if project:
                if params.get("all", None):
                    ldebug("Getting ALL records")
                    deviceq = Device.select(lambda d: d.device_project == project).order_by(Device.last_modified)
                    total_count=count(deviceq)
                    devices = deviceq.page(int(pagenum), int(pagesize))
                    ldebug(f"Got {len(devices)} of {total_count} records")
                    result = format_all(project, None, devices, total_count)
                else:
                    model = find_model(params, project)
                    if model:
                        deviceq = Device.select(lambda d: d.device_project == project and
                                              d.model == model).order_by(Device.last_modified)
                        total_count=count(deviceq)
                        devices = deviceq.page(int(pagenum), int(pagesize))
                        ldebug(f"Got {len(devices)} of {total_count} records")
                        result = format_all(project, model, devices, total_count)
                    else:
                        device = find_device(params, project)
                        if device:
                            result = format_device(project, device.model, device, True)
                        else:
                            code = 418
                            result = {"status": "error", "message": "Device not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project not found"}

    except Exception as e:
        ldebug(f"ERROR getting record: {str(e)}")
        traceback.print_exc()
        code = 500
        result = {"status": "error", "message": str(e)}

    ldebug(f"Returning result: {result}")
    return code, json.dumps(result)


def lambda_handler(event, context):
    result = ""
    code = 400
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
        lerror(logging.traceback.format_exc())

    response = {
        "isBase64Encoded": False,
        "headers": return_response_headers(method),
        "statusCode": code,
        "body": result
    }

    return response
