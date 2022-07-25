# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Model
# iot_api_model
#
# The device and model creation/deletion algorithm is a bit arcane. For details, please consult the header of the
# iot_api_data/main.py lambda.
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.dbutil import *
from iotapp.utils import *
from iotapp.logger import *
import os
import traceback


connect_database()

def format_one(rec):

    device_count = get_count_of_devices_by_model(rec)

    return_data = {
        "id": rec.id.hex,
        "model": rec.name,
        "project": rec.model_project.name,
        "require_position": rec.require_position,
        "type": enum_to_str(ModelType, rec.model_type),
        "protocol": enum_to_str_list(ModelProtocol, rec.model_protocol),
        "connection": enum_to_str(ModelConnection, rec.model_connection),
        "ml": enum_to_str_list(ModelML, rec.model_ml),
        "security": enum_to_str(ModelSecurity, rec.model_security),
        "storage": enum_to_str_list(ModelStorage, rec.model_storage),
        "device_count": device_count,
        "has_digital_twin": rec.has_digital_twin
    }

    if rec.desc:
        return_data['desc'] = rec.desc
    if rec.display_name:
        return_data['display_name'] = rec.display_name
    if rec.display_order:
        return_data['display_order'] = rec.display_order
    if rec.revision:
        return_data['revision'] = rec.revision
    if rec.hw_version:
        return_data['hw_version'] = rec.hw_version
    if rec.image_url:
        return_data['image'] = rec.image_url
    if rec.icon_url:
        return_data['icon'] = rec.icon_url

    if rec.has_digital_twin:
        if rec.twin3d_model_url:
            return_data['twin3d_model_url'] = rec.twin3d_model_url
        if rec.env_img_url:
            return_data['env_img_url'] = rec.env_img_url
        if rec.sky_box_url:
            return_data['sky_box_url'] = rec.sky_box_url

    if rec.date_created:
        return_data['date_created'] = rec.date_created.isoformat()
    if rec.last_modified:
        return_data['last_modified'] = rec.last_modified.isoformat()
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

#
# This function formats the result as a JSON document suitable for sending to SiteWise.
# It can be requested for a single model.
#
# For format specification, see here: https://docs.aws.amazon.com/iot-sitewise/latest/userguide/create-asset-models.html
# You can send the output in this format to the SiteWise CreateAssetModel
# (https://docs.aws.amazon.com/iot-sitewise/latest/APIReference/API_CreateAssetModel.html) or as a json file
# via the AWS CLI.
#
def format_one_for_sitewise(model):
    result = {
        "assetModelName": model.name,
        "assetModelDescription": model.desc,
        "assetModelHierarchies": []
    }

    # Now we get the list of all data types defined for that model and append them to the
    # returned data.
    #
    properties = []
    all_data_types = DataType.select(lambda dt: dt.model == model).order_by(DataType.name)
    for data_type in all_data_types:
        one_data = {
            "name": data_type.name,
            "type": {
                "measurement": {}
            }
        }
        type_unit = data_type.units
        type_name = data_type.name
        if type_name == "string" or type_name == "str":
            one_data["dataType"] = "STRING"
        elif type_name == "integer" or type_name == "int":
            one_data["dataType"] = "INTEGER"
        elif type_name == "float" or type_name == "double":
            one_data["dataType"] = "DOUBLE"

        if type_unit:
            one_data["unit"] = type_unit

        properties.append(one_data)

    result["assetModelProperties"] = properties
    return result


@db_session
def add_record(params):
    code = 200
    result = {}
    device = None

    try:
        project = find_project(params)
        if project:
            name = params.get("name", "")

            # We are forced to set Model names as non-unique since there can be multiple projects
            # with same model name. Instead, we check to see if a model of the same name already
            # exists in this project and if so, we flag it.

            if name:
                model = Model.get(model_project=project, name=name)
                if model:
                    code = 418
                    result = {"status": "error", "message": f"Model with name [{name}] already exists in this project."}
                else:
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

                    model_security_str = params.get("security", "none")
                    model_security = enum_from_str(ModelSecurity, model_security_str)

                    model_storage_str = params.get("storage", "none")
                    model_storage = enum_from_str_list(ModelStorage, model_storage_str)

                    twin3d_model_url = params.get("twin3d_url", "")
                    env_img_url = params.get("env_img_url", "")
                    sky_box_url = params.get("sky_box_url", "")

                    hw_version = params.get("hw_version", "0.1")

                    model = Model(model_project=project,
                                        name=name,
                                        desc=desc,
                                        revision=revision,
                                        display_name=display_name,
                                        display_order=display_order,
                                        image_url=image_url,
                                        icon_url=icon_url,
                                        require_position=position,
                                        model_type=model_type,
                                        model_protocol=model_protocol,
                                        model_connection=model_connection,
                                        model_ml=model_ml,
                                        model_security=model_security,
                                        model_storage=model_storage,
                                        twin3d_model_url=twin3d_model_url,
                                        env_img_url=env_img_url,
                                        sky_box_url=sky_box_url,
                                        hw_version=hw_version
                                        )
                    commit()
                    result = {"status": "ok", "id": model.id.hex}
            else:
                code = 418
                result = {"status": "error", "message": "Model name is required."}
        else:
            code = 418
            result = {"status": "error", "message": "Model could not be created. Invalid project"}
    except pony.orm.core.TransactionIntegrityError as e:
        lerror(f"Error adding Project: {str(e)}")
        code = 409
        result = {"status": "error", "message": f"Model '{name}' already exists"}

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
            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    ldebug(f"Got model: {model.name}")
                    if params.get("sitewise", None):
                        result = format_one_for_sitewise(model)
                    else:
                        result = format_one(model)
                else:
                    if params.get("all", None):
                        all_models = Model.select(lambda m: m.model_project == project).order_by(
                            Model.date_created)
                        code = 200
                        result = format_all(all_models)
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

    ldebug(f"Returning result: {result}")
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
    updates = {}

    try:
        model = None
        project = None
        if params:
            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    ldebug(f"Got model: {model.name}")

                    new_name = params.get("new_name", None)
                    if new_name:
                        updates['name'] = new_name

                    desc = params.get("desc", None)
                    if desc:
                        updates['desc'] = desc

                    revision = params.get("revision", None)
                    if revision:
                        updates['revision'] = revision

                    display_name = params.get("display_name", None)
                    if display_name:
                        updates['display_name'] = display_name

                    display_order = params.get("display_order", None)
                    if display_order:
                        updates['display_order'] = display_order

                    image_url = params.get("image", None)
                    if image_url:
                        updates['image_url'] = image_url

                    icon_url = params.get("icon", None)
                    if icon_url:
                        updates['icon_url'] = icon_url

                    position = params.get("require_position", None)
                    if position:
                        updates['position'] = position

                    twin3d_model_url = params.get("twin3d_url", None)
                    if twin3d_model_url:
                        updates['twin3d_model_url'] = twin3d_model_url

                    env_img_url = params.get("env_img_url", None)
                    if env_img_url:
                        updates['env_img_url'] = env_img_url

                    sky_box_url = params.get("sky_box_url", None)
                    if sky_box_url:
                        updates['sky_box_url'] = sky_box_url

                    hw_version = params.get("hw_version", "0.1")
                    if hw_version:
                        updates['hw_version'] = hw_version

                    # These changes are OK to make -- they don't impact device functionality.
                    #
                    ldebug(f"Updating model with basic data: {str(updates)}")
                    model.set(**updates)
                    commit()
                    #
                    # We zero out the already processed updates
                    #
                    updates = {}
                    #
                    # Certain attributes of a model, it's OK to change. For example, model name
                    # or description. Others, like what sort of device type it is, can only be
                    # modified if NO device instances of this type exist.
                    #
                    # If there aren't any instances, we can go ahead and change them because the
                    # values will be picked up the next time a device of this type is created.
                    #
                    # The only exception is if a device is a gateway AND it is referenced
                    # from other records. In that case, we don't allow the device to be modified
                    # in any way since that could break things downstream.
                    #
                    gateway = params.get("gateway", None)
                    if gateway:
                        updates['gateway'] = gateway

                    model_type_str = params.get("type", None)
                    if model_type_str:
                        model_type = enum_from_str(ModelType, model_type_str)
                        if model_type:
                            updates['model_type'] = model_type

                    model_protocol_str = params.get("protocol", None)
                    if model_protocol_str:
                        model_protocol = enum_from_str_list(ModelProtocol, model_protocol_str)
                        if model_protocol:
                            updates['model_protocol'] = model_protocol

                    model_connection_str = params.get("connection", None)
                    if model_connection_str:
                        model_connection = enum_from_str(ModelConnection, model_connection_str)
                        if model_connection:
                            updates['model_connection'] = model_connection

                    model_ml_str = params.get("ml", None)
                    if model_ml_str:
                        model_ml = enum_from_str_list(ModelML, model_ml_str)
                        if model_ml:
                            updates['model_ml'] = model_ml

                    model_security_str = params.get("security", None)
                    if model_security_str:
                        model_security = enum_from_str(ModelSecurity, model_security_str)
                        if model_security:
                            updates['model_security'] = model_security

                    model_storage_str = params.get("storage", None)
                    if model_storage_str:
                        model_storage = enum_from_str_list(ModelStorage, model_storage_str)
                        if model_storage:
                            updates['model_storage'] = model_storage

                    # If one of the changes required a big update, then we check to see
                    # if devices of this model exist. If they do, we won't be making a change.
                    # If they don't, we're good to make the changes.
                    #
                    ldebug(f"Model device instance data updates: {str(updates)}")
                    if len(updates) > 0:
                        devices = Device.select(lambda d: d.device_project == project and
                                              d.model == model)
                        if count(devices) == 0:  # nothing to worry about
                            ldebug(f"Updating model with 0 device data: {str(updates)}")
                            model.set(**updates)
                            commit()
                            code = 200
                            result = {"status": "ok", "id": model.id.hex}
                        else:
                            code = 418
                            result = {"status": "error", "message": "Devices of this Model already exist. Can not modify Model."}
                    else:
                        code = 200
                        result = {"status": "ok", "id": model.id.hex}

                else:
                    code = 418
                    result = {"status": "error", "message": "Model not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project not found"}

    except Exception as e:
        lerror(f"Error modifying Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


@db_session
def delete_record(params):
    """
    Called with the DELETE REST call to remove a record.

    NOTE: we should do a sideways call to delete all the devices that have this model, one by one.
    This way, the Thing and GG items will also be deleted properly. Only after all have been deleted
    should we delete the record out of the database.

    Also, if the device record indicates that there were IOT certificates created for this model AND
    one exists, we make sure we go back and clean up that certificate.

    :param params:
    :return:
    """
    code = 200
    result = {}
    try:
        if params:
            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    model_id = model.id.hex
                    model.delete()
                    commit()
                    result = {"status": "ok", "id": model_id}
                    code = 200
                else:
                    code = 418
                    result = {"status": "error", "message": "Model record not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project not found"}
    except Exception as e:
        lerror(f"Error deleting Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

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
