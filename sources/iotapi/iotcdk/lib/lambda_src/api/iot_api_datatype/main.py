# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: DataType
# iot_api_datatype
#
import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.logger import *
import os


connect_database()

def format_one(rec):
    return_data = {
        "id": rec.id.hex,
        "name": rec.name,
    }

    if rec.desc:
        return_data['desc'] = rec.desc

    if rec.model:
        return_data["model"] = rec.model.name
        return_data["project"] = rec.model.model_project.name
    if rec.data_type:
        return_data["data_type"] = rec.data_type
    if rec.units:
        return_data["units"] = rec.units
    if rec.show_on_twin:
        return_data["show_on_twin"] = str(rec.show_on_twin)
    if rec.units:
        return_data["data_position"] = rec.data_position
    if rec.data_normal:
        return_data["data_normal"] = rec.data_normal
    if rec.label_template:
        return_data["label_template"] = rec.label_template
    if rec.ranges:
        return_data["ranges"] = rec.ranges
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


@db_session
def add_record(params):
    code = 200
    result = {}
    device = None

    try:
        project = find_project(params)
        if project:
            model = find_model(params, project)
            if model:
                name = params.get("name", "")
                if name:
                    dt = DataType.select(lambda dt: dt.model.model_project == project and
                                                                    dt.model == model and
                                                                    dt.name == name).first()
                    # We create it only if the same name didn't already exist
                    if not dt:
                        desc = params.get("desc", "")
                        data_type = params.get("data_type", "")
                        units = params.get("units", "")
                        show_on_twin = params.get("show_on_twin", False)
                        data_position = params.get("data_position", "")
                        data_normal = params.get("data_normal", "")
                        label_template = params.get("label_template", "")
                        ranges = params.get("ranges", "")

                        type = DataType(name=name,
                                              desc=desc,
                                              model=model,
                                              data_type=data_type,
                                              units=units,
                                              show_on_twin=show_on_twin,
                                              data_position = data_position,
                                              data_normal = data_normal,
                                              label_template = label_template,
                                              ranges = ranges
                                              )
                        commit()
                        result = {"status": "ok", "id": type.id.hex}
                    else:
                        code = 409
                        result = {"status": "error", "message": f"DataType '{name}' already exists"}
                else:
                    code = 418
                    result = {"status": "error", "message": "DataType could not be created. Invalid name"}
            else:
                code = 418
                result = {"status": "error", "message": "DataType could not be created. Invalid model"}
        else:
            code = 418
            result = {"status": "error", "message": "DataType could not be created. Invalid project"}

    except Exception as e:
        lerror(f"Error creating DataType: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

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
        device_data_type = None

        if params:
            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    device_data_type_name = params.get("name", "")
                    if device_data_type_name:
                        device_data_type = DataType.select(lambda dt: dt.model == model and dt.name == device_data_type_name).first()
                    else:
                        device_type_id = params.get("id", "")
                        if device_type_id:
                            device_data_type = DataType.select(lambda dt: dt.model == model and dt.id.hex == device_type_id).first()

                    if device_data_type:
                        result = format_one(device_data_type)
                    else:
                        if params.get("all", None):
                            all_data_types = DataType.select(lambda dt: dt.model == model).order_by(
                                DataType.date_created)
                            code = 200
                            result = format_all(all_data_types)
                        else:
                            code = 418
                            result = {"status": "error", "message": "Can not find DataTypes"}
                else:
                    code = 404
                    result = {"status": "error", "message": "Can not find model"}
            else:
                code = 404
                result = {"status": "error", "message": "Can not find project"}

    except Exception as e:
        lerror(f"Error Getting DataType: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    linfo(f"Returning result: {result}")
    return code, json.dumps(result)


@db_session
def modify_record(params):
    """
    Called with the PUT REST call to modify an existing record.
    :param params:
    :return:
    """
    code = 200
    result = {}
    updates = {}
    data_type = None

    try:
        model = None
        project = None
        if params:
            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    ldebug(f"Got model: {model.name}")

                    data_type_name = params.get("name", "")
                    if data_type_name:
                        ldebug(f"Getting Datatype with name: {data_type_name}")
                        data_type = DataType.select(lambda dt: dt.model == model and dt.name == data_type_name).first()
                    else:
                        type_id = params.get("id", "")
                        if type_id:
                            ldebug(f"Getting Datatype with id: {type_id}")
                            data_type = DataType.select(lambda dt: dt.model == model and dt.id.hex == type_id).first()

                    ldebug(f"Got Datatype: {data_type.name}")
                    if data_type:
                        new_name = params.get("new_name", None)
                        if new_name:
                            updates['name'] = new_name

                        desc = params.get("desc", None)
                        if desc:
                            updates['desc'] = desc

                        type = params.get("data_type", None)
                        if type:
                            updates['data_type'] = type

                        units = params.get("units", None)
                        if units:
                            updates['units'] = units

                        show_on_twin = params.get("show_on_twin", None)
                        if show_on_twin:
                            updates['show_on_twin'] = show_on_twin

                        data_position = params.get("data_position", None)
                        if data_position:
                            updates['data_position'] = data_position

                        data_normal = params.get("data_normal", None)
                        if data_normal:
                            updates['data_normal'] = data_normal

                        label_template = params.get("label_template", None)
                        if label_template:
                            updates['label_template'] = label_template

                        ranges = params.get("ranges", None)
                        if ranges:
                            updates['ranges'] = ranges

                        ldebug(f"Updating datatype with data: {str(updates)}")
                        data_type.set(**updates)
                        commit()
                        code = 200
                        result = {"status": "ok", "id": model.id.hex}
                    else:
                        code = 418
                        result = {"status": "error", "message": "DataType not found"}
                else:
                    code = 418
                    result = {"status": "error", "message": "Model not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project not found"}

    except Exception as e:
        lerror(f"Error modifying DataType: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


@db_session
def delete_record(params):
    """
    Called with the DELETE REST call to remove a record.

    NOTE: we should do a sideways call to delete all the device data that have this type, one by one.
    This way, the Thing and GG items will also be deleted properly. Only after all have been deleted
    should we delete the record out of the database.

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
                    device_data_type_name = params.get("name", "")
                    if device_data_type_name:
                        device_data_type = DataType.select(lambda dt: dt.model.model_project == project and
                                                                        dt.model == model and
                                                                        dt.name == device_data_type_name).first()
                    else:
                        device_type_id = params.get("id", "")
                        device_data_type = DataType.select(lambda dt: dt.model.model_project == project and
                                                                        dt.model == model and
                                                                        dt.id == device_type_id).first()

                    if device_data_type:
                        device_data_type_id = device_data_type.id.hex
                        device_data_type.delete()
                        commit()
                        result = {"status": "ok", "id": device_data_type_id}
                        code = 200
                    else:
                        code = 418
                        result = {"status": "error", "message": "DataType record not found"}
                else:
                    code = 418
                    result = {"status": "error", "message": "Model record not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project not found"}
    except Exception as e:
        lerror(f"Error deleting DataType: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    return code, json.dumps(result)


def lambda_handler(event, context):
    result = {}
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

    # response_headers = {
    #     'Content-Type': 'application/json'
    # }

    response = {
        "isBase64Encoded": False,
        "headers": return_response_headers(method),
        "statusCode": code,
        "body": result
    }

    return response
