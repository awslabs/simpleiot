# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Project
# iot_api_project
#

import boto3
import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.dbutil import *
from iotapp.utils import *
from iotapp.logger import *
import os

lambda_client = boto3.client('lambda')

connect_database()


def format_one(rec):
    return_data = {
        "id": rec.id.hex,
        "name": rec.name,
    }

    if rec.models:
        model_list = []
        for model in rec.models:
            model_list.append(model.name)
        return_data['models'] = model_list
    if rec.devices:
        device_list = []
        for device in rec.devices:
            device_list.append(device.serial_number)
        return_data['devices'] = device_list
    if rec.desc:
        return_data['desc'] = rec.desc
    if rec.date_created:
        return_data['date_created'] = rec.date_created.isoformat()
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


def get_and_validate_data(params):
    data = {}
    name = params.get("project_name", None)
    if not name:
        name = params.get("project_name", None)
    if name:
        data['name'] = name

    new_name = params.get("new_name", None)
    if new_name:
        data['new_name'] = new_name

    desc = params.get("desc", "")
    if desc:
        data['desc'] = desc

    template_name = params.get("template_name", None)
    if template_name:
        data['template_name'] = template_name

    template_id = params.get("template_id", None)
    if template_id:
        data['template_id'] = template_id
    return data


#
# This lets us create one or more devices based on a template that's in the Template
# table. The template is assumed to be a JSON value of a given form. If it isn't
# or it's malformed, bad things will happen.
#
# We run through the template body and invoke lambdas that create a model and
# any appropriate data type of this kind. The names of each can be synthesized
# by specifying "project" or "project_id" as part of the names.
#
def create_models_with_template(project, template_data):
    ldebug(f"Creating project with template: {str(template_data)}")
    item_ids = []
    model_name = ""

    for one_model in template_data:
        model = one_model.get("model")
        ldebug(f"CREATING ONE MODEL: {str(model)}")
        model_payload = {
            "project_name": project.name
        }

        # Name may have a 'format' string of the form {project}XXXX in it.
        # in that case we pass it through the python formatter.
        #
        project_dict = {
            "project": project.name,
            "project_id": project.id.hex,
            "id": project.id.hex
        }
        name = model.get("name", None)
        ldebug(f"Model Name: {model_name}")
        if name:
            model_name = name.format(**project_dict)
            model_payload["name"] = model_name
        desc = model.get("desc", None)
        if desc:
            model_desc = desc.format(**project_dict)
            model_payload["desc"] = model_desc
        type = model.get("type", None)
        if type:
            model_payload["type"] = type
        icon = model.get("icon", None)
        if icon:
            model_payload["icon"] = icon
        security = model.get("security", None)
        if security:
            model_payload["security"] = security
        storage = model.get("storage", None)
        if storage:
            model_payload["storage"] = storage
        protocol = model.get("protocol", None)
        if protocol:
            model_payload["protocol"] = protocol
        connection = model.get("connection", None)
        if connection:
            model_payload["connection"] = connection
        ml = model.get("ml", None)
        if ml:
            model_payload["ml"] = ml

        payload = {"httpMethod": "POST",
                   "body": json.dumps(model_payload)
                   }
        payload_str = json.dumps(payload)

        ldebug(f"INVOKE WITH: {payload_str}")
        response = lambda_client.invoke(
            FunctionName="iot_dev_api_model",
            InvocationType="RequestResponse",
            Payload=payload_str
        )
        ldebug(f"LAMBDA RESPONSE: {str(response)}")
        if response['StatusCode'] == 200:
            response_body_str = response["Payload"].read().decode("utf-8")
            ldebug(f"GOT RESULT MODEL: {str(response_body_str)}")
            response_json = json.loads(response_body_str)
            response_body_str = response_json["body"]
            response_body = json.loads(response_body_str)
            model_id = response_body.get("id", None)
            ldebug(f"GOT MODEL ID: {model_id}")
            if model_id:
                model_result = {"model": model_name,
                                "model_id": model_id}
                item_ids.append(model_result)

                # We also see if there's any embedded DataType as part of this.
                #
                datatypes = model.get("datatypes", None)
                if datatypes:
                    #
                    # If there are datatypes, we're going to want to get
                    # the model we just created and use that to pass down
                    # data to the
                    model_guid = uuid.UUID(model_id)
                    model = Model.get(id=model_guid)
                    datatype_dict = {
                        "project": project.name,
                        "project_name": project.name,
                        "project_id": project.id.hex,
                        "model": model.name,
                        "model_name": model.name,
                        "model_id": model.id.hex
                    }
                    for datatype_data in datatypes:
                        datatype_result = create_datatypes_with_template(project, model, datatype_dict, datatype_data)
                        if datatype_result:
                            item_ids.append(datatype_result)
        else:
            ldebug(f"ERROR creating model {model_name}: {response['statusCode']}. Continuing.")

    return item_ids


def create_datatypes_with_template(project, model, datatype_dict, datatype_data):
    datatype_name = ""
    datatype_result = None

    datatype_payload = {
        "project": project.name,
        "model": model.name
    }
    # Name may have a 'format' string of the form {foo}XXXX in it where foo can be any
    # of project, project_name, project_id, model, model_name, or model_id. These
    # are used to synthesize a datatype name using the python string formatter.
    #
    name = datatype_data.get("name", None)
    if name:
        datatype_name = name.format(**datatype_dict)
        datatype_payload["name"] = datatype_name
    desc = datatype_data.get("desc", None)
    if desc:
        datatype_payload["desc"] = desc
    data_type = datatype_data.get("data_type", None)
    if data_type:
        datatype_payload["data_type"] = data_type
    units = datatype_data.get("units", None)
    if units:
        datatype_payload["units"] = units
    show_on_twin = datatype_data.get("show_on_twin", None)
    if show_on_twin:
        datatype_payload["show_on_twin"] = show_on_twin
    data_position = datatype_data.get("data_position", None)
    if data_position:
        datatype_payload["data_position"] = data_position
    data_normal = datatype_data.get("data_normal", None)
    if data_normal:
        datatype_payload["data_normal"] = data_normal
    label_template = datatype_data.get("label_template", None)
    if label_template:
        datatype_payload["label_template"] = label_template
    ranges = datatype_data.get("ranges", None)
    if ranges:
        datatype_payload["ranges"] = ranges

    payload = {"httpMethod": "POST",
               "body": json.dumps(datatype_payload)
               }
    payload_str = json.dumps(payload)
    response = lambda_client.invoke(
        FunctionName="iot_dev_api_datatype",
        InvocationType="RequestResponse",
        Payload=payload_str
    )
    ldebug(f"iot_dev_api_datatype LAMBDA RESPONSE: {str(response)}")
    if response['StatusCode'] == 200:
        response_body_str = response["Payload"].read().decode("utf-8")
        ldebug(f"GOT RESULT MODEL: {str(response_body_str)}")
        response_json = json.loads(response_body_str)
        response_body_str = response_json["body"]
        response_body = json.loads(response_body_str)
        datatype_id = response_body.get("id", None)
        if datatype_id:
            ldebug(f"GOT DATATYPE ID: {datatype_id}")
            datatype_result = {
                "project": project.name,
                "project_id": project.id.hex,
                "model": model.name,
                "model_id": model.id.hex,
                "datatype": datatype_name,
                "datatype_id": datatype_id
            }
        else:
            ldebug("ERROR: no data type ID returned from datatype creation")
    else:
        ldebug(f"Error creating datatype {datatype_name}. Status: {response['StatusCode']}. Continuing.")

    return datatype_result


@db_session
def add_record(params):
    project = None
    code = 200

    try:
        data = get_and_validate_data(params)
        ldebug(f"CALLED WITH PARAMS: {json.dumps(params, indent=4)}")
        name = data.get("name", None)

        if name:
            desc = data.get("desc", "")
            project = Project(name=name, desc=desc)
            commit()

            template = None
            template_id = data.get("template_id", None)
            if template_id:
                ldebug(f"GOT TEMPLATE ID: {template_id}")
                template_guid = uuid.UUID(template_id)
                template = Template.get(id=template_guid)
            else:
                template_name = data.get("template_name", None)
                ldebug(f"GOT TEMPLATE NAME: {template_name}")
                if template_name:
                    template = Template.get(name=template_name)

            if template:
                template_value = template.value
                if template_value:
                    ldebug(f"GOT TEMPLATE VALUE: {template_value}")
                    template_data = json.loads(template_value)
                    if template_data:
                        item_ids = create_models_with_template(project, template_data)
                        result = {"status": "ok", "id": project.id.hex, "items": item_ids}
            else:
                result = {"status": "ok", "id": project.id.hex}
        else:
            code = 418
            result = {"status": "error", "message": "Missing name. Project could not be created"}

    except pony.orm.core.TransactionIntegrityError as e:
        lerror(f"Error adding Project: {str(e)}")
        code = 409
        result = {"status": "error", "message": "Project already exists"}

    except Exception as e:
        lerror(f"Unable to create project. Delete all related objects then re-create: {str(e)}")
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
        project = None

        if params:
            project = find_project(params)
            if project:
                result = format_one(project)
            else:
                if params.get("all", None):
                    ldebug("Getting ALL records")
                    projects = Project.select().order_by(Project.date_created)
                    ldebug(f"Got {count(projects)} records")
                    result = format_all(projects)
                else:
                    code = 418
                    result = {"status": "error", "message": "project not found"}

    except Exception as e:
        lerror(f"Error getting Project: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    ldebug(f"Returning result: {result}")
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
    update = {}
    try:
        data = get_and_validate_data(params)
        project = find_project(params)
        if project:
            new_name = data.get("new_name", None)
            if new_name:
                update["name"] = new_name
            desc = data.get("desc", None)
            if desc:
                update["desc"] = desc

            project.set(**update)
            commit()
        else:
            code = 418
            result = {"status": "error", "message": "Project not found"}

    except Exception as e:
        lerror(f"Error modifying Project: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    ldebug(f"Returning result: {result}")
    return code, json.dumps(result, indent=4)

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
    try:
        if params:
            project = find_project(params)
            if project:
                project_id = project.id.hex
                project.delete()
                flush()
                result = {"status": "ok", "id": project_id}
                code = 200
            else:
                code = 418
                result = {"status": "error", "message": "record not found"}
    except Exception as e:
        lerror(f"Error deleting Project: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    return code, json.dumps(result)


def lambda_handler(event, context):
    result = ""
    code = 200
    method = ""

    try:
        method = event["httpMethod"]
        ldebug(f"METHOD: {method}")

        if method == "POST":
            body = event["body"]
            payload = json.loads(body)
            code, result = add_record(payload)
        elif method == "GET":
            params = event.get("queryStringParameters", None)
            code, result = get_record(params)
        elif method == "PUT":
            body = event["body"]
            params = json.loads(body)
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
