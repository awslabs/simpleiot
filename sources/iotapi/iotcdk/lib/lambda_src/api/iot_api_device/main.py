# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
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
import boto3

ldebug("Importing iot module")
from iotapp.iotthing import *

ldebug("Importing gg module")
from iotapp.iotgg import *

DEFAULT_REGION = os.getenv("AWS_REGION")
region = os.environ['AWS_REGION']
prefix = os.environ['PREFIX']
stage = os.environ['STAGE']

connect_database()


def format_device(project, model, dev, show_cert=False, detail=False):
    return_data = {
        "id": dev.id.hex,
        "serial": dev.serial_number,
        "name": dev.name,
        "desc": dev.desc
    }
    if project:
        return_data["project"] = project.name
    if model:
        return_data["model"] = model.name

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
            return_data['gateway_serial'] = gateway.serial_number
        if dev.date_manufactured:
            return_data['date_manufactured'] = dev.date_manufactured.isoformat()
    if dev.date_created:
        return_data['date_created'] = dev.date_created.isoformat()

    if show_cert:
        return_data["ca_pem"] = dev.device_ca_data
        return_data["cert_pem"] = dev.device_cert_data
        return_data["private_key"] = dev.device_private_key_data
        return_data["public_key"] = dev.device_public_key_data

    return return_data


# This is used to format all the data -- assumes there's a local format_one method in the current
# object.
#
def format_all(project, model, recs, show_cert):
    return_data = []
    for device in recs:
        one = format_device(project, model, device, show_cert, False)
        return_data.append(one)
    return return_data


#
# The device creation algorithm is a bit complex, but here goes:
#
# There are several 'TYPE' of devices: NONE, DEVICE, GATEWAY, and MOBILE.
#
# If type is NONE, we don't track it inside IOT. The idea is this is for devices like BLE wearables,
# or ones talking to IOT via LoRa, etc. where the security to the end device isn't managed by AWS IOT.
# But since we're going to track devices as part of the lifecycle, we do keep a database record.
#
# If the device type is DEVICE, then we're an end-node device. In this case, two things could happen, depending
# on the SECURITY flag. If security is set to DEVICE (the default), then each time we create one, we also create
# an IOT Thing, along with the certs. We store the cert strings in the database so subsequent team-members can come
# and get them as well, when building firmware. If security is set to MODEL, then we share all the certs between
# devices of the same model. In that case, we create the cert ONLY once, when the first instance of the device is
# created. If so, the certs are stored at the Model level. The converse of this is if a device is deleted AND
# the security is set to MODEL, we don't delete the Thing until the very last device associated with that model is
# deleted, then we remove the Thing and take the cert data out of the model.
#
# If the device type is GATEWAY, then we're a Greengrass Core device. In this case, the same applies. If the
# security is set to DEVICE, we create a new Greengrass Core for each device and point at it. If the security
# is set to MODEL, then again, we create the Greengrass Core device ONLY if it's the first device instance of this
# type being created. From then on, the Gateway device is assumed to be using that cert to communicate with AWS IOT.
# If they Gateway SECURITY is set to MODEL, then again, we only create a single Greengrass Core and all devices of this
# type share the same Greengrass Core. We don't create the Greengrass Core until the very first instance of the
# device is created.
#
# We do this in a lazy-late-binding fashion so the user can change their settings without incurring any sort of
# penalty. Only once they've created a single instance of that device will we lock things in. And after that, you
# won't be able to change those settings again... unless, you go and delete all the devices of this type. Then, you
# can change settings again and create a new device based on the new model settings.
#
# This means that the CREATE process for a device has to change based on what type of device we're making, what
# the security setting is, and whether we're the first one or any subsequent once.
#
# The same is true when modifying a model setting or when deleting a device.
#
# When deleting a device, if the security setting was MODEL (meaning all devices of that model share the same
# security settings), then we won't delete the IOT Thing or Greengrass until it's the very last one. Only then
# do we go about zapping it and resetting the record.
#
# For update to the Model, if there are any device instances of that type in existence, we decline the change, until
# they've gone off and removed all instances of the device and only then do we allow for modification.
#
def get_iot_settings():
    data = {}
    #
    # Here we return the settings needed by GG to create and wire up the GG lambdas, resources, etc.
    #
    return data


@db_session
def add_record(params):
    code = 200
    result = {}
    device = None
    device_ca = ""
    device_cert = ""
    device_private_key = ""
    device_public_key = ""
    iot_config_data = ""
    iot_data = {}

    try:
        serial = params.get("serial", None)
        if not serial:
            code = 418
            result = {"status": "error", "message": "'Serial' field missing"}
        else:
            project = find_project(params)
            if project:
                model = find_model(params, project)
                if model:
                    # Check to see if serial number is already taken. We can't set Serial to unique at
                    # DB level, because you need to be unique per-project.
                    #
                    device = Device.select(lambda d: d.device_project == project and
                                                     d.serial_number == serial)
                    if not device:
                        ldebug(f"Duplicate not found. Creating.")
                        name = params.get("name", "")
                        desc = params.get("desc", "")
                        #
                        # First we check to see if we're creating a DEVICE, MOBILE, or a GATEWAY. If DEVICE or MOBILE
                        # then we see if the Security requires creation of a Thing per device or per model.
                        # If per model, we check to see if any devices of this type exist. If not, then we create that device.
                        #
                        is_gateway = False

                        # First: we see if this is a Device or a Gateway?
                        #
                        ldebug(f"Model Type is {ModelType(model.model_type)}")
                        if ModelType(model.model_type) is ModelType.DEVICE:
                            #
                            # Next, we see if we need per-device certs or per-model certs.
                            #
                            ldebug(f"Model Security is {ModelSecurity(model.model_security)}")
                            if ModelSecurity(model.model_security) is ModelSecurity.DEVICE:
                                #
                                # Per-device certs. So we need to go create an IOT Thing for it.
                                # iot_config_data is all the data returned from AWS IOT in a single construct.
                                #
                                iot_data = create_iot_thing("iot", serial, return_certs_inline=True)
                                if iot_data:
                                    ldebug(f"Got IOT result: {str(iot_data)}")
                                    device_ca = iot_data.get('ca_pem', "")
                                    device_cert = iot_data.get('cert_pem', "")
                                    device_public_key = iot_data.get('public_key', "")
                                    device_private_key = iot_data.get('private_key', "")
                                    iot_config_data = json.dumps(iot_data, indent=4)
                                else:
                                    ldebug("ERROR: could not create IOT thing")
                                    code = 418
                                    result = {"status": "error", "message": "Could not create Device Record."}
                                    return code, json.dumps(result)

                            # If security model is per-model, it means we only need to create certs
                            # at the model-level and it will be shared for every device.
                            # This makes it less secure, but easier to do model-wide firmware updates.
                            # For this, we copy the device certs from the model. We lazy-create model certs
                            # so if this is the first device assigned to the model, we create it and
                            # update the model. We do this by checking the iot_config_data field and if
                            # it's blank, we assume to certs have been created.
                            #
                            if ModelSecurity(model.model_security) is ModelSecurity.MODEL:
                                # If there's a model-cert already there, let's copy it.
                                if model.iot_config_data:
                                    ldebug(f"Got IOT settings at MODEL level.")
                                    iot_config_data = model.iot_config_data
                                    device_ca = model.model_ca_data
                                    device_cert = model.model_cert_data
                                    device_public_key = model.model_public_key_data
                                    device_private_key = model.model_private_key_data
                                else:
                                    ldebug(f"No IOT config data at MODEL. Creating IOT Thing.")

                                    # If it's not there, we go create one, then save it back into
                                    # the Model for later use AND copy it to our local device as well.
                                    #
                                    # unique_id = f"dev-{project.name}-{model.name}-{serial}"
                                    unique_id = f"{serial}"
                                    ldebug(f"No IOT config data at MODEL. Creating IOT for {unique_id}.")
                                    iot_data = create_iot_thing("iot", unique_id, return_certs_inline=True)
                                    if iot_data:
                                        ldebug(f"Got IOT result: {str(iot_data)}")
                                        ldebug(f"Writing IOT settings to Model.")
                                        device_ca = iot_data.get('ca_pem', "")
                                        model.model_ca_data = device_ca
                                        device_cert = iot_data.get('cert_pem', "")
                                        model.model_cert_data = device_cert

                                        device_public_key = iot_data.get('public_key', "")
                                        model.model_public_key_data = device_public_key

                                        device_private_key = iot_data.get('private_key', "")
                                        model.model_private_key_data = device_private_key

                                        iot_config_data = json.dumps(iot_data, indent=4)
                                        model.iot_config_data = iot_config_data

                                        # Let's save it to the model.
                                        commit()
                                        ldebug(f"IOT settings saved to Model.")

                        # If here, the device we're creating is a gateway not an end-node device.
                        # NOTE: for ggv2, the GGv2 Nucleus creation has to be initiated from the device side.
                        #
                        elif ModelType(model.model_type) is ModelType.GATEWAY:
                            is_gateway = True
                            ldebug(f"Model type is GATEWAY.")

                            # Create the GG Group (if it doesn't already exist). Here again, we
                            # see if the certs are per-device or per model family.
                            ldebug(f"Model Security is {ModelSecurity(model.model_security)}.")
                            if ModelSecurity(model.model_security) is ModelSecurity.MODEL:
                                if model.iot_config_data:
                                    ldebug(f"Already have GG iot_config_data from Model.")
                                    iot_config_data = model.iot_config_data
                                    device_ca = model.model_ca_data
                                    device_cert = model.model_cert_data
                                    device_public_key = model.model_public_key_data
                                    device_private_key = model.model_private_key_data
                                else:
                                    ldebug(f"GG iot_config_data not found. Creating GG for model.")
                                    # unique_id = f"{project.name}-{model.name}-{serial}"
                                    unique_id = f"{serial}"
                                    ldebug(f"Getting GG settings for {unique_id}.")

                                    data = get_iot_settings()
                                    iot_data = create_iot_gg(data, "iot", "gg", unique_id, return_certs_inline=True)
                                    if iot_data:
                                        ldebug(f"Got fresh GG IOT result: {iot_config_data}")
                                        device_ca = iot_data.get('ca_pem', "")
                                        model.model_ca_data = device_ca
                                        device_cert = iot_data.get('cert_pem', "")
                                        model.model_cert_data = device_cert

                                        device_public_key = iot_data.get('public_key', "")
                                        model.model_public_key_data = device_public_key

                                        device_private_key = iot_data.get('private_key', "")
                                        model.model_private_key_data = device_private_key

                                        iot_config_data = json.dumps(iot_data, indent=4)
                                        model.iot_config_data = iot_config_data

                                        # Let's save it to the model.
                                        commit()
                                        ldebug(f"Saved GG IOT settings to Model")
                                    else:
                                        ldebug(f"ERROR: could not create greengrass and get IOT settings")
                                        code = 500
                            elif ModelSecurity(model.model_security) is ModelSecurity.DEVICE:
                                ldebug(f"Creating GG IOT settings for each device")
                                # unique_id = f"{project.name}-{model.name}-{serial}"
                                unique_id = f"{serial}"
                                data = get_iot_settings()
                                iot_data = create_iot_gg(data, "iot", "gg", unique_id, return_certs_inline=True)
                                if iot_data:
                                    iot_config_data = json.dumps(iot_data, indent=4)
                                    ldebug(f"Got fresh GG IOT result: {iot_config_data}")
                                    device_ca = iot_data.get('ca_pem', "")
                                    device_cert = iot_data.get('cert_pem', "")
                                    device_public_key = iot_data.get('public_key', "")
                                    device_private_key = iot_data.get('private_key', "")

                        # If we're here we go ahead and create the Device record (whether it
                        # has cert or  not.
                        #
                        if iot_config_data:
                            ldebug(f"Creating Device record for {serial}")
                            device = Device(device_project=project,
                                            serial_number=serial,
                                            name=name,
                                            model=model,
                                            desc=desc,
                                            device_ca_data=device_ca,
                                            device_cert_data=device_cert,
                                            device_public_key_data=device_public_key,
                                            device_private_key_data=device_private_key,
                                            iot_config_data=iot_config_data,
                                            is_gateway=is_gateway)
                            if device:
                                ldebug(f"{serial} device record created")
                                code = 200

                                # We merge what IOT returns with the data record and send that whole thing back.
                                #
                                iot_data["status"] = "ok"
                                db_data = format_device(None, None, device, False)
                                result = {**iot_data, **db_data}
                            else:
                                code = 418
                                result = {"status": "error", "message": "Could not create Device Record."}
                        else:
                            code = 418
                            result = {"status": "error", "message": "Could not create Device. NO IOT Settings"}
                    else:
                        code = 418
                        result = {"status": "error", "message": f"Device serial number '{serial}' already in project"}
                else:
                    code = 418
                    result = {"status": "error", "message": "Invalid model. Device could not be created"}
            else:
                code = 418
                result = {"status": "error", "message": "Invalid Project. Device could not be created"}
    except Exception as e:
        traceback.print_exc()
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
        device = None
        project = None

        if params:
            project = find_project(params)
            model = None
            if project:
                show_cert = params.get('show_cert', False)
                if params.get("all", None):
                    ldebug("Getting ALL records")
                    devices = Device.select(lambda d: d.device_project == project)
                    ldebug(f"Got {count(devices)} records")
                    result = format_all(project, None, devices, show_cert)
                else:
                    model = find_model(params, project)
                    if model:
                        devices = Device.select(lambda d: d.device_project == project and
                                                          d.model == model)
                        ldebug(f"Got {count(devices)} records")
                        result = format_all(project, model, devices, show_cert)
                    else:
                        device = find_device(params, project)
                        if device:
                            result = format_device(project, device.model, device, show_cert, True)
                        else:
                            code = 418
                            result = {"status": "error", "message": "Device not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project not found"}

    except Exception as e:
        traceback.print_exc()
        ldebug(f"ERROR getting record: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    ldebug(f"Returning result: {result}")
    return code, json.dumps(result)


def find_device_with_serial(serial, project):
    device = Device.select(lambda d: d.device_project == project and d.serial_number == serial).first()
    ldebug(f"Found device: {device.serial_number}")
    return device


def attach_device_to_gateway(params):
    code = 418
    result = {}
    project = None
    model = None
    device = None
    gateway = None

    project = find_project(params)
    if project:
        device_serial = params.get("device", None)
        if not device_serial:
            result = {"status": "error", "message": f"Parameter 'device' with serial number not specified"}
        else:
            device = find_device_with_serial(device_serial, project)
            if not device:
                result = {"status": "error", "message": f"Device with serial number {device_serial} not found"}
            else:
                model = device.model
                if ModelType(model.model_type) is not ModelType.DEVICE:
                    result = {"status": "error", "message": "Device Model is not of type DEVICE"}
                else:
                    gateway_serial = params.get("gateway", None)
                    if gateway_serial:
                        gateway = find_device_with_serial(gateway_serial, project)
                    if not gateway:
                        result = {"status": "error",
                                  "message": f"Gateway with serial number {gateway_serial} not found"}
                    else:
                        if ModelType(gateway.model.model_type) is not ModelType.GATEWAY:
                            result = {"status": "error", "message": "Gateway device Model is not of type GATEWAY"}
                        else:
                            #
                            # If we're here, the device is of type DEVICE and the gateway is of type
                            # gateway. If the device was already attached to a gateway, let's detach it
                            # in GGv2 and then go about and attach the new one.
                            #
                            if device.gateway:
                                ggv2_detach_device(device)
                                device.gateway = None
                                commit()

                            ggv2_attach_device(device, gateway)

                            code = 200
                            result = {"status": "ok",
                                      "device_id": device.id.hex,
                                      "gateway_id": gateway.id.hex
                                      }
    else:
        result = {"status": "error", "message": "Project not found"}

    return code, result


def detach_device_from_gateway(params):
    code = 418
    result = {}
    project = None
    model = None
    device = None

    try:
        project = find_project(params)
        if project:
            device_serial = params.get("device", None)
            if not device_serial:
                result = {"status": "error", "message": f"Parameter 'device' not specified"}
            else:
                device = find_device_with_serial(device_serial, project)

                if device:
                    model = device.model
                    if ModelType(model.model_type) is ModelType.DEVICE:
                        ggv2_detach_device(device)
                        code = 200
                        result = {"status": "ok", "device_id": device.id.hex}
                    else:
                        result = {"status": "error", "message": "Device Model is not of type DEVICE"}
                else:
                    result = {"status": "error", "message": f"Device with serial number {device_serial} not found"}
        else:
            result = {"status": "error", "message": "Project not found"}
    except Exception as e:
        ldebug(f"Error detaching device from gateway: {str(e)}")

    return code, result


#
# This only works if the device was created via the API, so the thing_name is present inside the
# iot_config_data JSON. We attach a device to another so runtime device discovery can work.
#

def get_device_and_gateway_thing_names(device, gateway):
    device_thing_name = None
    gateway_thing_name = None

    try:
        ldebug("Getting device and gateway thing names")
        device_config_data = device.iot_config_data
        gateway_config_data = gateway.iot_config_data

        if device_config_data:
            device_data = json.loads(device_config_data)
            device_thing_name = device_data.get("thing_name", None)

        if gateway_config_data:
            gateway_data = json.loads(gateway_config_data)
            gateway_thing_name = gateway_data.get("thing_name", None)

        if device_thing_name and device_thing_name:
            ldebug(f"Got device thing name: {device_thing_name} - gateway thing name: {gateway_thing_name}")
        else:
            ldebug(f"Error: could not get device or gateway thing name")
    except Exception as e:
        ldebug(f"Error getting device and gateway name: {str(e)}")

    return device_thing_name, gateway_thing_name


def ggv2_attach_device(device, gateway):
    result = False
    device_thing_name = None
    gateway_thing_name = None

    try:
        device_thing_name, gateway_thing_name = get_device_and_gateway_thing_names(device, gateway)
        ldebug(f"Attaching device: {device_thing_name} to gateway: {gateway_thing_name}")

        if device_thing_name and device_thing_name:
            ggv2 = boto3.client('greengrassv2')
            resp = ggv2.batch_associate_client_device_with_core_device(entries=[
                {'thingName': device_thing_name}],
                coreDeviceThingName=gateway_thing_name)
            ldebug(f"Device associated with gateway: {json.dumps(resp, indent=2)}")
            device.gateway = gateway
            commit()
            result = True

    except Exception as e:
        ldebug(f"Error attaching device to gateway: {str(e)}")

    return result


def ggv2_detach_device(device):
    result = False

    try:
        gateway = device.gateway
        if gateway:
            device_thing_name, gateway_thing_name = get_device_and_gateway_thing_names(device, gateway)
            ldebug(f"Detaching device: {device_thing_name} from gateway: {gateway_thing_name}")

            ggv2 = boto3.client('greengrassv2')
            resp = ggv2.batch_disassociate_client_device_from_core_device(entries=[
                {'thingName': device_thing_name}],
                coreDeviceThingName=gateway_thing_name)
            ldebug(f"Device dissociated from gateway: {json.dumps(resp, indent=2)}")
            device.gateway = None
            commit()
            result = True

    except Exception as e:
        ldebug(f"Error detaching device from gateway: {str(e)}")

    return result


def place_device_at_location(params):
    code = 418
    result = {}
    project = None
    model = None
    return code, result


def remove_device_from_location(params):
    code = 418
    result = {}
    project = None
    model = None
    return code, result


def acquire_device_by_user(params):
    code = 418
    result = {}
    project = None
    model = None
    return code, result


def unacquire_device_from_user(params):
    code = 418
    result = {}
    project = None
    model = None
    return code, result


def modify_device_params(params):
    pass


@db_session
def modify_record(params):
    """
    Called with the PUT REST call to modify an existing record.

    This also is overloaded to allow devices to be associated or disassociated to/from other
    items. This includes:

    - attach: Associating an end device with a gateway
    - place: Placing a device at a location
    - acquire: Acquiring (registering) a device to a user
    - (Future: assign device to a payment subscription plan and/or a technical support plan)

    For each of these, there's an equivalent reverse operation (detach/remove/unacquire).

    For all these the "op" parameter would need to be specified. If "op" is not there, then
    the modify operation will allow various fields to be updated (other than serial number).
    """
    code = 418
    result = {}
    device = None

    if params:
        op = params.get("op", None)
        if op:
            ldebug(f"Executing Opcode: {op}")
            if op == "attach":
                code, result = attach_device_to_gateway(params)
            elif op == "detach":
                code, result = detach_device_from_gateway(params)
            elif op == "place":
                code, result = place_device_at_location(params)
            elif op == "remove":
                code, result = remove_device_from_location(params)
            elif op == "acquire":
                code, result = acquire_device_by_user(params)
            elif op == "unacquire":
                code, result = unacquire_device_from_user(params)
            else:
                result = {"status": "error", "message": "Invalid 'op' value specified"}
        else:
            #
            # No operation. Just a straight modification of fields.
            #
            status = modify_device_params(device)
            if status:
                code = 200
                result = {"status": "ok"}
            else:
                code = 418
                result = {"status": "error", "message": "Invalid device parameter to modify"}

    return code, json.dumps(result)


@db_session
def delete_record(params):
    """
    Called with the DELETE REST call to remove a record. The Device record's
    'before_delete' hook deletes any IOT data.

    :param params:
    :return:
    """
    code = 200
    result = {}
    try:
        if params:
            project = find_project(params)
            if project:
                device = find_device(params, project)
                if device:
                    # If device was associated with a gateway, let's make sure GG clears up the
                    # association. NOTE that if the device is a gateway, we may have to manually remove all
                    # the associated devices for it first (we'll need to test this with IOT GGv2).
                    #
                    if device.gateway:
                        detach_device_from_gateway(params)

                    device_id = device.id.hex
                    model = device.model.name
                    device.delete()
                    commit()
                    result = {"status": "ok", "model": model, "id": device_id}
                    code = 200
                else:
                    code = 418
                    result = {"status": "error", "message": "record not found"}
    except Exception as e:
        traceback.print_exc()
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
            params = event.get("queryStringParameters", None)
            code, result = modify_record(params)
        elif method == "DELETE":
            params = event.get("queryStringParameters", None)
            code, result = delete_record(params)

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
