# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Model
# iot_ui_api_twin
#
# The dashboard uses this to get Digital Twin data in one go. Data expected in
# is the name of a given model and a 'slice' label.
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.logger import *
import os
import traceback


connect_database()

def format_device(dev, detail=False):
    return_data = {
        "id": dev.id.hex,
        "serial": dev.serial_number,
    }

    if dev.name:
        return_data['name'] = dev.name
    if dev.desc:
        return_data['desc'] = dev.desc
    if detail:
        if dev.installed:
            return_data['installed'] = dev.installed
        if dev.error_message:
            return_data['error_message'] = dev.error_message
        if dev.position:
            return_data['position'] = dev.position
        if dev.geo_lat:
            return_data['lat'] = dev.geo_lat
        if dev.geo_lng:
            return_data['lng'] = dev.geo_lng
        if dev.geo_alt:
            return_data['alt'] = dev.geo_alt
        if dev.on_power:
            return_data['on_power'] = dev.on_power
        if dev.battery_level:
            return_data['battery_level'] = dev.battery_level
        if dev.gateway:
            gateway = dev.gateway
            return_data['gateway_id'] = gateway.id.hex
        if dev.date_manufactured:
            return_data['date_manufactured'] = dev.date_manufactured.isoformat()

        device_data = []
        if dev.data:
            return_data['data_count'] = count(dev.data)
            device_data = format_device_data(dev.data)

        return_data['data'] = device_data

    if dev.date_created:
        return_data['date_created'] = dev.date_created.isoformat()
    return return_data


def format_model(model, show_devices=False):

    device_count = get_count_of_devices_by_model(model)

    return_data = {
        "id": model.id.hex,
        "model": model.name,
        "require_position": model.require_position,
        "type": enum_to_str(ModelType, model.model_type),
        "protocol": enum_to_str_list(ModelProtocol, model.model_protocol),
        "connection": enum_to_str(ModelConnection, model.model_connection),
        "ml": enum_to_str_list(ModelML, model.model_ml),
        "security": enum_to_str(ModelSecurity, model.model_security),
        "storage": enum_to_str_list(ModelStorage, model.model_storage),
        "device_count": device_count
    }

    if model.desc:
        return_data['desc'] = model.desc
    if model.display_name:
        return_data['display_name'] = model.display_name
    if model.display_order:
        return_data['display_order'] = model.display_order
    if model.revision:
        return_data['revision'] = model.revision
    if model.hw_version:
        return_data['hw_version'] = model.hw_version
    if model.image_url:
        return_data['image'] = model.image_url
    if model.icon_url:
        return_data['icon'] = model.icon_url

    return_data['has_digital_twin'] = model.has_digital_twin
    if model.has_digital_twin:
        if model.twin3d_model_url:
            return_data['twin3d_model_url'] = model.twin3d_model_url
        if model.env_img_url:
            return_data['env_img_url'] = model.env_img_url
        if model.sky_box_url:
            return_data['sky_box_url'] = model.sky_box_url

    data_types = DataType.select(lambda d: d.model == model)
    data_types_data = []
    return_data['type_count'] = count(data_types)
    if count(data_types) > 0:
        data_types_data = format_data_type(data_types)

    return_data['data_types'] = data_types_data

    if show_devices:
        devices = Device.select(lambda d: d.device_project == model.model_project and
                                          d.model == model)
        ldebug(f"Got {count(devices)} records")
        device_list = []
        for device in devices:
            one_device = format_device(device, False)
            device_list.append(one_device)
        return_data['devices'] = device_list

    if model.date_created:
        return_data['date_created'] = model.date_created.isoformat()
    if model.last_modified:
        return_data['last_modified'] = model.last_modified.isoformat()
    return return_data

def format_one_data_type(type):
    return_data = {
        "id": type.id.hex,
        "udi": type.udi,
        "name": type.name,
        "type": type.data_type,
        "units": type.units,
        "allow_modify": type.allow_modify,
        "show_on_twin": type.show_on_twin,
        "data_position": type.data_position,
        "data_normal": type.data_normal,
        "label_template": type.label_template,
        "ranges": type.ranges,
        "date_created":  type.date_created.isoformat()
    }
    return return_data

def format_data_type(data_types):
    return_data = []
    for type in data_types:
        type_value = format_one_data_type(type)
        return_data.append(type_value)
    return return_data

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


# This is used to format all the data
#
def format_all(project, recs):

    type_options = {}
    for type in ModelType:
        type_options[type.name.capitalize()] = type.value

    security_options = {}
    for security in ModelSecurity:
        security_options[security.name] = security.value

    storage_options = {}
    for storage in ModelStorage:
        storage_options[storage.name] = storage.value

    protocol_options = {}
    for protocol in ModelProtocol:
        protocol_options[protocol.name] = protocol.value

    ml_options = {}
    for ml in ModelML:
        ml_options[ml.name] = ml.value

    options = {
        "type": type_options,
        "security": security_options,
        "storage": storage_options,
        "protocol": protocol_options,
        "ml": ml_options
    }

    return_data = {
        "project": project.name,
        "project_id": project.id.hex,
        "model_count": len(recs),
        "options": options
    }

    model_data = []
    for rec in recs:
        one = format_model(rec, False)
        model_data.append(one)

    return_data["models"] = model_data
    return return_data


@db_session
def add_record(params):
    code = 200
    result = {}
    device = None

    try:
        project = find_project(params)
        if project:
            name = params.get("name", "")
            desc = params.get("desc", "")
            revision = params.get("revision", "")
            display_name = params.get("display_name", "")
            display_order = params.get("display_order", 0)
            image_url = params.get("image", "")
            icon_url = params.get("icon", "")
            position = params.get("require_position", False)
            gateway = params.get("gateway", False)

            model_type_str = params.get("type", "device")
            model_type = enum_from_str(ModelType, model_type_str)

            model_protocol_str = params.get("protocol", "mqtt")
            model_protocol = enum_from_str_list(ModelProtocol, model_protocol_str)

            model_connection_str = params.get("connection", "direct")
            model_connection = enum_from_str(ModelConnection, model_connection_str)

            model_ml_str = params.get("ml", "none")
            model_ml = enum_from_str_list(ModelML, model_ml_str)

            model_security_str = params.get("security", ModelSecurity.DEVICE.value)
            model_security = enum_from_str(ModelSecurity, model_security_str)

            model_storage_str = params.get("storage", ModelStorage.NONE.value)
            model_storage = enum_from_str_list(ModelStorage, model_storage_str)

            hw_version = params.get("hw_version", "")

            model = Model(model_project=project,
                                name=name,
                                desc=desc,
                                revision=revision,
                                display_name=display_name,
                                display_order=display_order,
                                image_url=image_url,
                                icon_url=icon_url,
                                require_position=position,
                                is_gateway=gateway,
                                model_type=model_type,
                                model_protocol=model_protocol,
                                model_connection=model_connection,
                                model_ml=model_ml,
                                model_security=model_security,
                                model_storage=model_storage,
                                hw_version=hw_version
                                )
            commit()
            result = {"status": "ok", "id": model.id.hex}
        else:
            code = 418
            result = {"status": "error", "message": "Project could not be created. Invalid project"}
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
    try:
        model = None
        project = None

        if params:
            pagenum = params.get("pagenum", 1)
            pagesize = params.get("pagesize", 999999)

            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    ldebug(f"Got model: {model.name}")
                    result = format_model(model, True)
                else:
                    if params.get("all", None):
                        all_models = Model.select(lambda m: m.model_project == project).order_by(
                            Model.date_created).page(int(pagenum), int(pagesize))
                        code = 200
                        result = format_all(project, all_models)
                    else:
                        code = 418
                        result = {"status": "error", "message": "Can not find model"}

            else:
                code = 404
                result = {"status": "error", "message": "Can not find project"}

    except Exception as e:
        lerror(f"Error Getting Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


def lambda_handler(event, context):
    result = ""
    code = 404
    method = ""


    try:
        method = event["httpMethod"]

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
