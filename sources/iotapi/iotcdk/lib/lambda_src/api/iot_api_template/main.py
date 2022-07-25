# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: template
# iot_api_template
#
# Placeholder for supporting project creation templates. Templates allow one-shot creation of
# a number of related device models. It can be used to spin-up a default set of device definitions,
# models, devicetypes, etc.
#

import json
import uuid
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
        "type": enum_to_str(TemplateType, rec.type),
        "name": rec.name,
        "desc": rec.desc,
        "icon_url" : rec.icon_url,
        "author": rec.author,
        "email": rec.email,
        "dev_url": rec.dev_url,
        "license": rec.license,
        "zip_url": rec.zip_url
    }
    if rec.date_created:
        return_data['date_created'] = rec.date_created.isoformat()
    try:
        if rec.value:
            json_value = json.loads(rec.value)
            if json_value:
                return_data['value'] = json_value
    except Exception as e:
        pass
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
        name = params.get("name", "")
        desc = params.get("desc", "")
        type_str = params.get("type", "")
        type = enum_from_str(TemplateType, type_str)
        icon_url = params.get("icon_url", "")
        author = params.get("author", "")
        email = params.get("email", "")
        dev_url = params.get("dev_url", "")
        license = params.get("license", "")
        zip_url = params.get("zip_url", "")
        value = ""
        value_obj = params.get("value", "")
        if value_obj:
            value = json.dumps(value_obj)

            template = Template(name=name,
                                desc=desc,
                                type=type,
                                icon_url=icon_url,
                                author=author,
                                email=email,
                                dev_url=dev_url,
                                license=license,
                                zip_url=zip_url,
                                value=value)
            commit()
            result = {"status": "ok", "id": template.id.hex}
        else:
            code = 418
            result = {"status": "error", "message": "Template could not be created. Invalid template"}
    except pony.orm.core.TransactionIntegrityError as e:
        lerror(f"Error adding Template: {str(e)}")
        code = 409
        result = {"status": "error", "message": f"Template '{name}' already exists"}

    except Exception as e:
        lerror(f"Error creating Template: {str(e)}")
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
        template = None

        if params:
            all = params.get("all", None)
            if all:
                type_str = params.get("type", "project")
                type = enum_from_str(TemplateType, type_str)
                ldebug(f"TypeStr: {type_str} - Type: {type}")
                all_templates = Template.select(lambda t: t.type == type).order_by(Template.name)
                code = 200
                result = format_all(all_templates)
            else:
                template = None
                template_id = params.get("id", None)
                if template_id:
                    template_guid = uuid.UUID(template_id)
                    template = Template.get(id=template_guid)
                else:
                    name = params.get("name", None)
                    if name:
                        template = Template.get(name=name)

                if template:
                    ldebug(f"Got template: {template.name}")
                    result = format_one(template)
                else:
                    code = 418
                    result = {"status": "error", "message": "Can not find template"}

    except Exception as e:
        lerror(f"Error Getting Template: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

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
        if params:
            template = None
            id = params.get("id", None)
            if id:
                template = Template.select(lambda t: t.id == id).order_by(Template.name)
            else:
                name = params.get("name")
                template = Template.select(lambda t: t.name == name).order_by(Template.name)
            if template:
                ldebug(f"Got template: {template.name}")
                result = format_one(template)

                new_name = params.get("new_name", None)
                if new_name:
                    updates['name'] = new_name

                desc = params.get("desc", None)
                if desc:
                    updates['desc'] = desc

                type_str = params.get("type", None)
                if type_str:
                    type = str_to_enum(TemplateType, type_str)
                    if type:
                        updates['type'] = type.value

                icon_url = params.get("icon_url", None)
                if icon_url:
                    updates['icon_url'] = icon_url

                author = params.get("author", None)
                if author:
                    updates['author'] = author

                email = params.get("email", None)
                if email:
                    updates['email'] = email

                dev_url = params.get("dev_url", None)
                if dev_url:
                    updates['dev_url'] = dev_url

                license = params.get("license", None)
                if license:
                    updates['license'] = license

                zip_url = params.get("zip_url", None)
                if zip_url:
                    updates['zip_url'] = zip_url

                value = params.get("value", None)
                if value:
                    value_str = json.dumps(value)
                    updates['value'] = value

                template.set(**updates)
                commit()
            else:
                code = 418
                result = {"status": "error", "message": "Template not found"}

    except Exception as e:
        lerror(f"Error modifying Template: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

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
        template = None
        id = params.get("id", None)
        if id:
            template = Template.select(lambda t: t.id == id).order_by(Template.name)
        else:
            name = params.get("name")
            template = Template.select(lambda t: t.name == name).order_by(Template.name)

        if template:
            template_id = template.id.hex
            ldebug(f"Deleting template: {template.name}")
            template.delete()
            commit()
            result = {"status": "ok", "id": template_id}
            code = 200
        else:
            code = 418
            result = {"status": "error", "message": "Model record not found"}
    except Exception as e:
        lerror(f"Error deleting Template: {str(e)}")
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
