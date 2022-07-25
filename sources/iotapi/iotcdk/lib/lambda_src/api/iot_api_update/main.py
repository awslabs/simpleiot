# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Firmware/File update
# iot_api_update
#
# This API allows firmware or configuration files to be queued for update to devices.
# The API is used to upload the payload, capture metadata, and invoke pushes to the
# systems out there. Devices that want to check if an update exists can also 'pull'
# via both REST calls or via specially formatted MQTT calls.
#
# To keep things in one place, all operations related to firmware updates are included
# here, with different functions disambiguated via an "item" operation command.
#
# The operations supported include:
#
# POST (item)
#   upload: returns a pre-signed URL to which the payload can be uploaded
#   payload: called when the payload has been uploaded to S3. This creates the Firmware record.
#   session: starts an update session, using a payload ID. This creates a range of UpdateDevice
#           records and sends them all notifications.
#
# PUT (item):
#   payload: allows modification of metadata associated with the payload.
#   update: called to update the status of each UpdateDevice session
#
# GET (item):
#   payload: returns information about all the uploaded payloads
#   session: returns information about all queued sessions
#   update: get information on each individual update targeted at a device
#
# DELETE (item):
#    payload: deletes a file from S3. There should be protections so if a session is
#             pointing at a payload and it's already been launched. If so, the payload can
#             not be removed.
#    session: deletes a session and all its related updates
#    update: deletes a device update (although this might have to be monitored and logged)
#

import json
import boto3
from botocore.exceptions import ClientError
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.params import *
from iotapp.logger import *

from pony.orm import *
import os
import pathlib
import uuid
import semantic_version
import time
import traceback
import logging
from urllib.parse import urljoin, urlparse, quote, unquote

logging.basicConfig(level=os.environ.get("IOT_LOGLEVEL", "INFO"))
log = logging.getLogger("simpleiot")

SIMPLEIOT_IOT_ENDPOINT_KEY = "/simpleiot/iot/endpoint"

s3 = boto3.resource('s3')
region = os.environ['AWS_REGION']

# Enable or disable semantic version checking. Turn this off if any of the devices
# have firmware versions that don't comply with semantic versioning. However, dong so you
# will stop being able to do version comparison and when checking for updates, it will
# always return the most recent one.
#
USE_SEMVER = False


try:
    iot_endpoint = get_param(SIMPLEIOT_IOT_ENDPOINT_KEY)
    ldebug(f"IOT endpoint: {iot_endpoint}")
    iotclient = boto3.client('iot-data',
                             region_name=region,
                             endpoint_url=f"https://{iot_endpoint}")
except Exception as e:
    traceback.print_exc()
    ldebug(f"No SSM parameter with {SIMPLEIOT_IOT_ENDPOINT_KEY} found")
    pass

connect_database()

PRE_SIGNED_URL_EXPIRATION = 3600


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

def format_one_upload(rec):
    return_data = {
        "id": rec.id.hex,
        "force": rec.force_update,
        "state": enum_to_str(FirmwareState, rec.state),
        "name": rec.name,
        "desc": rec.desc,
        "version": rec.version,
        "release_note": rec.release_note,
        "user_data": rec.user_data,
        "url": rec.payload_url,
        "md5": rec.md5_hash
     }

    if rec.model:
        return_data['model'] = rec.model.name
    if rec.device:
        return_data['serial'] = rec.device.serial_number
        return_data['model'] = rec.device.model.name

    if rec.last_modified:
        return_data['last_modified'] = rec.last_modified.isoformat()
    return return_data


def format_uploads(recs):
    return_data = []
    for rec in recs:
        one = format_one_upload(rec)
        return_data.append(one)
    return return_data


def get_upload_records(params):
    code = 200
    result = {}
    uploads = None

    try:
        project = None
        model = None
        device = None
        uploads = []

        ldebug(f"Getting upload records")
        if params:
            firmware_id = params.get("id", None)
            if firmware_id:
                ldebug(f"Getting upload with firmware id: {firmware_id}")
                fid = uuid.UUID(firmware_id)
                upload = Firmware.get(lambda f: f.id == fid)
                uploads = [upload]
                ldebug(f"Returning {len(uploads)} records")
                code = 200
                result = format_uploads(uploads)
            else:
                project = find_project(params)
                ldebug(f"Project is: {project.name}")
                if project:
                    version = params.get("version", None)
                    device = find_device(params, project)
                    if device:
                        ldebug(f"Getting by device: {device.serial_number} -- {device.id.hex}")
                        if version:
                            ldebug(f"Getting uploads for device: {device.serial_number} and version: {version}")
                            uploads = Firmware.select(lambda f: f.device == device and f.version == version).order_by(Firmware.version)
                        else:
                            serial = params.get("serial", None)
                            one_device = Device.get(serial_number=serial)
                            ldebug(f"Got device record: {one_device.serial_number}")                            # uploads = Firmware.select(lambda f: f.device == device)
                            uploads = Firmware.select(lambda f: f.device == device)
                    else:
                        model = find_model(params, project)
                        if model:
                            if version:
                                ldebug(f"Getting uploads for model: {model.name} and version: {version}")
                                uploads_by_model = Firmware.select(lambda f: f.model == model and f.version == version).order_by(Firmware.version)
                                uploads_by_device_model = Firmware.select(lambda f: f.device.model == model and f.version == version).order_by(Firmware.version)
                                uploads = [*uploads_by_model, *uploads_by_device_model]
                            else:
                                ldebug(f"Getting uploads for model: {model.name}")
                                uploads_by_model = Firmware.select(lambda f: f.model == model)
                                uploads_by_device_model = Firmware.select(lambda f: f.device.model == model)
                                uploads = [*uploads_by_model, *uploads_by_device_model]

                    ldebug(f"Returning {len(uploads)} records")
                    code = 200
                    result = format_uploads(uploads)
                else:
                    code = 418
                    result = {"status": "error", "message": "Missing Project Name"}
    except Exception as e:
        traceback.print_exc()
        ldebug(f"ERROR getting update: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    return code, result


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
        if params:
            item = params.get("item", None)
            if item == "upload":
                code, result = get_upload_records(params)
            elif item == "push":
                code, pushes = get_push_records(params)
            elif item == "session":
                code, pushes = get_session_records(params)

    except Exception as e:
        traceback.print_exc()
        ldebug(f"ERROR getting record: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    ldebug(f"Returning result: {result}")
    return code, json.dumps(result)


#
# To upload twin media files to be hosted by SimpleIOT is a multi-step process.
# First, a POST is called, passing the project and model. If the record already has
# a twin file registered, we delete the media file, erase the db field, then
# proceed as if it's a new upload.
#
# We get the name of the bucket from System Settings for "twinMediaBucketName"
#
# If there is no upload record for the model, we create a random name and a pre-signed
# URL, the base of which we save in the db record. The caller is then supposed to
# use the pre-signed URL to upload the media.
#
# Once done, they are supposed to call back to this routine and pass the pre-signed URL
# in as a parameter. If the base of that URL and the one we saved from the first step
# match, we assume the content is loaded, kick off a CloudFront invalidation and return success.
#
# If the URLs don't match, we erase the record inside the database record and return error.
#
# This scheme has a couple of potential flaws:
#
# Q: What if someone calls the first time but never calls the second?
# A: We set an expiration date of 15m for the URL so it expires. But the base record is left in the
#    model database. That will not have a file attached to it. When the model viewer goes to
#    request the file, we will be returning a URL of a file that is not there and will generate
#    a 404 error. ModelViewer will have to deal with that.
# Q: What if there is an upload error?
# A: The caller should call back with a DELETE to erase the record. Or, they can start with an
#    initial POST again to overwrite the pre-signed URL.
# Q: Are there malicious ways to abuse this?
# A: Never say never. However, to do so means they will have had to compromise the Cognito auth
#    to be able to call this method. Also, it would be possible to upload a file with a malicious
#    payload. Testing potential bad content could be tested there.
#
# To reset the whole scheme, you can call DELETE, with no parameters. If there is a URL
# in the Model, it will be deleted and the field will be erased so you can start again.
#
def get_system_setting(name):
    result = None

    if name:
        setting = SystemSetting.get(name=name)
        if setting:
            result = setting.value

    ldebug(f"System setting: {name} - result: {result}")
    return result


def delete_update_file(model, bucket):
    try:
        model_file = model.twin3d_model_url
        if model_file:
            path = pathlib.PurePath(model_file)
            object_name = path.name
            s3.Object(bucket, object_name).delete()
            ldebug(f"Old Model file {model_file} deleted from bucket: {bucket}")
            model.twin3d_model_url = ""
            commit()
    except Exception as e:
        pass


# Based on official docs: https://boto3.amazonaws.com/v1/documentation/api/latest/guide/s3-presigned-urls.html
#
def create_presigned_url(bucket_name, object_name, expiration=PRE_SIGNED_URL_EXPIRATION):
    """Generate a presigned URL S3 POST request to upload a file

    :param bucket_name: string
    :param object_name: string
    :param expiration: Time in seconds for the presigned URL to remain valid
    :return: Dictionary with the following keys:
        url: URL to post to
        fields: Dictionary of form fields and values to submit with the POST
    :return: None if error.
    """

    # Generate a presigned S3 POST URL
    #
    s3_client = boto3.client('s3')
    try:
        response = s3_client.generate_presigned_url('put_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_name
                                                            },
                                                    ExpiresIn=expiration)
    except ClientError as e:
        ldebug(e)
        return None

    # The response contains the presigned URL and required fields
    ldebug(f"Presigned response: {response}")
    return response


#
# This invalidates just the file that just got uploaded so CloudFront snags it from
# S3.
#
def invalidate_cloudfront(url):
    distribution_id = get_system_setting("fwUpdateCFDistributionId")
    url_path = urlparse(url).path
    path = pathlib.PurePath(url_path)
    object_name = "/" + path.name

    ldebug(f"Invalidating Cloudfront for {object_name} with Distribution ID: {distribution_id}")
    cf = boto3.client('cloudfront')
    res = cf.create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={
            'Paths': {
                'Quantity': 1,
                'Items': [
                    object_name
                ]
            },
            'CallerReference': str(time.time()).replace(".", "")
        }
    )
    invalidation_id = res['Invalidation']['Id']
    return invalidation_id


#
# Adding an upload creates a pre-signed URL to which the actual file can be uploaded.
# We create a record for it, but it's in an 'incomplete' state since it doesn't have
# confirmation that the file is uploaded. To make it complete, you have to call back
# with the POST and item=payload parameter.
#
# An upload has to be associated with a Model or a Device.
#
# To send a file up, in Python you can use:
#
# import requests
#
# upload_file = 'model.glb'
#
# with open(upload_file, 'rb') as fb:
#     files = {'file': (upload_file, fb)}
#     response = requests.post(post_url, data=post_params, files=files)
#
# print(f"Upload Status: {response.status_code}")

def add_upload_file(params):
    code = 200
    result = {}
    project = None
    model = None
    device = None

    try:
        project = find_project(params)
        if project:
            model = find_model(params, project)
            if model:
                log.debug(f"Got model: {model.name}")
            else:
                device = find_device(params, project)
                if device:
                    log.debug(f"Got device: {device.serial_number}")

            if model or device:
                version = params.get("version", None)
                if version:
                    if USE_SEMVER:
                        is_valid = semantic_version.validate(version)
                    else:
                        is_valid = True

                    if is_valid:
                        file_name = params.get("file", None)
                        if file_name:
                            update_bucket = get_system_setting("fwUpdateBucketName")
                            ldebug(f"Creating pre-signed URL for bucket {update_bucket} and file {file_name}")
                            pre_signed_url = create_presigned_url(update_bucket, file_name)
                            #
                            # The URL returned contains pre-signed values on the query.
                            # We extract all the queries and save that in the database since that's what
                            # is going to get used to retrieve the object. We rewrite the URL
                            # so it doesn't have the queries and points at the update firmware Cloudfront
                            # domain.
                            #
                            if pre_signed_url:
                                update_domain = get_system_setting("fwUpdateDownloadDomain")
                                download_url = urljoin(update_domain, urlparse(pre_signed_url).path)
                                ldebug(f"Download URL: {download_url}")

                                name = params.get("name", "")
                                desc = params.get("desc", "")
                                release_note = params.get("release_note", "")
                                user_data = params.get("user_data", "")

                                firmware = Firmware(state=FirmwareState.INIT.value,
                                                    name=name,
                                                    desc=desc,
                                                    release_note=release_note,
                                                    user_data=user_data,
                                                    model=model,
                                                    device=device,
                                                    version=version,
                                                    payload_url=download_url)
                                commit()
                                code = 200

                                result = {
                                    "status": "ok",
                                    "file": file_name,
                                    "url": quote(pre_signed_url, safe=""),
                                    "firmware_id": firmware.id.hex
                                }
                            else:
                                code = 418
                                result = {"status": "error",
                                          "message": f"Could not generate pre-signed URL for upload to S3"}
                        else:
                            code = 418
                            result = {"status": "error", "message": f"Filename missing"}
                    else:
                        code = 418
                        result = {"status": "error", "message": f"Semantic version {version} is invalid"}
                else:
                    code = 418
                    result = {"status": "error", "message": "Firmware 'version' needs to be specified"}
            else:
                code = 418
                result = {"status": "error", "message": "'Model' or 'Device' need to be specified"}
        else:
            code = 418
            result = {"status": "error", "message": "'Project' needs to be specified"}

    except Exception as e:
        traceback.print_exc()
        code = 500
        result = {"status": "error", "message": f"{str(e)}"}

    return code, result


#
# This should be called after the file has been uploaded. They return with the ID and URL
# passed to them in the previous (item: "upload") call. We validate to make sure it's for the
# same pre-signed URL.
# NOTE: it's required that the URL be base64 encoded with UTF-8. This is so WAF rules don't snag the
# body of the request. We will be decoding it before comparing it.
#
def add_payload(params):
    code = 200
    result = {}
    url = None

    try:
        url_raw = params.get("url", None)
        if url_raw:
            url = unquote(url_raw)

        if url:
            firmware_id = params.get("firmware_id", None)
            if firmware_id:
                firmware_guid = uuid.UUID(firmware_id)
                firmware = Firmware.select(lambda f: f.id == firmware_guid).first()
                if firmware:
                    if firmware.state != FirmwareState.READY.value:
                        download_url = firmware.payload_url
                        url_root = urlparse(url).path
                        ldebug(f"Firmware URL: {download_url}")
                        ldebug(f"Param URL: {url_root}")
                        if download_url == url_root:
                            download_base = urlparse(download_url).path
                            upload_base = urlparse(url).path
                            ldebug(f"download_base URL: {download_base}")
                            ldebug(f"upload_base URL: {upload_base}")

                            if download_base == upload_base:
                                invalidate_cloudfront(download_base)

                                # Here, to make things faster, we append the download URL from cloudfront
                                # to the file and save that in the database.
                                #
                                # From here on out, that's the URL. But if they're going to delete the
                                # item, it's going to have to be deleted from the S3 origin and then
                                # a cloudfront invalidation needs to kick off. So on delete, the URL
                                # base has to be extracted and replaced with the S3 version.
                                #
                                ##
                                ## Here, we can also check to make sure the file type is the proper type and calculate the
                                ## MD5 hash for it. We'll leave it for now for performance reasons, but if we decide
                                ## to do it, we'll have to download the whole thing, calculate the MD5 and save that
                                ## in the database record. NOTE: using the S3 ETag is not advisable as that calculates
                                ## separate MD5 values based on multi-part uploads. It may not match the MD5
                                ## calcluated over the whole file.
                                ##
                                cloudfront_root = get_system_setting("fwUpdateDownloadDomain")
                                download_full_url = f"https://{cloudfront_root}{download_base}"
                                ldebug(f"Download URL set to: {download_full_url}")
                                firmware.payload_url = download_full_url
                                firmware.state = FirmwareState.READY.value
                                commit()

                                code = 200
                                result = {
                                    "status": "ok",
                                    "firmware_id": firmware_id
                                }
                            else:
                                code = 418
                                result = {"status": "error", "message": "URL does not match the one in initial call"}
                    else:
                        # Firmware already uploaded and ready to go. Just return the standard payload
                        code = 200
                        result = {
                            "status": "ok",
                            "firmware_id": firmware_id
                        }
                else:
                    code = 418
                    result = {"status": "error", "message": "Firmware record with ID not found"}
            else:
                code = 418
                result = {"status": "error", "message": "Firmware ID missing"}
        else:
            code = 418
            result = {"status": "error", "message": "Pre-signed encoded URL is missing"}

    except Exception as e:
        traceback.print_exc()
        code = 500
        result = {"status": "error", "message": f"{str(e)}"}

    return code, result


#
# This function looks for a Firmware record matching various attributes. If the firmware_id is
# specified, we only look for that. Otherwise, if a model OR device AND a version are specified
# we look for those. Any of the params passed can be None.
#
def find_firmware(firmware_id, model, device, version):
    firmware = None

    if firmware_id:
        firmware_guid = uuid.UUID(firmware_id)
        firmware = Firmware.select(lambda f: f.id == firmware_guid).first()

    #
    # NOTE: we may want to do a semver comparison instead of a strict string
    # comparison when looking for records to allow for a 'best-fit' match.
    #
    else:
        if version:
            if model:
                firmware = Firmware.get(lambda f: f.model == model and f.version == version)
                if not firmware:
                    if device:
                        firmware = Firmware.get(lambda f: f.device == device and f.version == version)

    return firmware


#
# Once they've uplaoded the firmware, they can turn around and initiate a session.
# We've split these into different stages in case they need to pre-load the firmware
# then get approval before actually submitting the update to the target devices.
# In this case, they get to submit extra metadata, including which devices get the
# update.
#
# The firmware_id is the database GUID for the firmware record. It has to be passed down.
# If you don't have it, it can be retrieved by specifying the model or device
# and version number.
#
# Parameters passed include:
#  - project
#  - model name or device serial number
#  - group (device group by ID - not implemented yet)
#  - name: display name given to the session
#  - desc: short note to attach to update session
#  - firmware_id: if not specified, version needs to be specified so we can look it up.
#  - version: (optional semver value. Should match the firmware record).
#  - release_date: (not implemented yet)
# Once quques

def add_session(params):
    code = 200
    result = {}
    project = None
    model = None
    device = None
    firmware = None
    session = None
    device_list = None

    try:
        ldebug("Adding a new UpdateSession")

        project = find_project(params)
        if project:
            # The target for the update has to be either a model, a single device, or (eventually
            # a device group which can be static or dynamic).
            #
            model = find_model(params, project)
            if model:
                log.debug(f"Got model: {model.name}")
            else:
                device = find_device(params, project)
                if device:
                    log.debug(f"Got device: {device.serial_number}")

                    name = params.get("name", "")
                    desc = params.get("desc", "")

                    # To specify which update to send out, you can either specify model/device and version
                    # or explicitly the firmware ID.
                    #
                    version = params.get("version", None)
                    firmware_id = params.get("firmware_id", None)

                    if device:
                        ldebug(
                            f"Looking for firmware with id: {firmware_id} - device: {device.serial_number} - version: {version}")
                    if model:
                        ldebug(
                            f"Looking for firmware with id: {firmware_id} - model: {model.name} - version: {version}")

                    firmware = find_firmware(firmware_id, model, device, version)

                    # If a firmware record was found, we now go and create an UpdateDevice record
                    # for each device targeted. If a model, we create one for all registered devices
                    #
                    # NOTE: if the each device already has firmware of that version or higher, we
                    # still go ahead and send out the notification, allowing the device to decide
                    # whether it should perform the task.
                    #
                    if firmware:
                        ldebug(f"Found firmware: {firmware.id.hex} - version: {version}")

                        device_list = []
                        if device:
                            device_list.append(device)
                        elif model:
                            device_list = Device.select(lambda d: d.model == model)

                        session = UpdateSession(state=UpdateState.ACTIVE.value,
                                                name=name,
                                                desc=desc,
                                                firmware=firmware,
                                                devices=device_list)
                        commit()

                        ldebug(f"Session record created. Id: {session.id.hex}")
                        # NOTE: this will be restricted in subsequent versions so different
                        # target segments can be created.
                        #
                        target_list = []
                        for target in device_list:
                            ldebug(f"Creating UpdateTargets for all target devices. Count: {len(device_list)}")

                            target = UpdateTarget(state=UpdateState.ACTIVE.value,
                                                  firmware=firmware,
                                                  device=target,
                                                  session=session)
                            ldebug(f"Created UpdateTarget record for device: {device.serial_number}")
                            target_list.append(target)

                        commit()

                        #
                        # For now, we process the target list immediately. Subsequently, if a "release_date"
                        # is specified in the UpdateSession, it will be processed at that release time.
                        #
                        target_count = len(target_list)
                        if target_count > 0:
                            ldebug(f"Processing {target_count} number of targets")
                            process_all_targets(target_list)
                        else:
                            ldebug(f"No targets to process")

                        ldebug("Update Session processing done.")
                    else:
                        code = 418
                        result = {"status": "error", "message": "No firmware matched to send with update"}
                else:
                    code = 418
                    result = {"status": "error", "message": "No target device found"}
        else:
            code = 418
            result = {"status": "error", "message": "No valid project specified"}
    except Exception as e:
        traceback.print_exc()
        code = 500
        result = {"status": "error", "message": f"{str(e)}"}

    return code, result


# - For each device, loop and send out an MQTT publish to the update status. Once a device has been updated
#   it will post back (either via MQTT or REST PUT back to the record) that it's done (or it failed).
# - If status was OK, the UpdateDevice record is marked as completed.
# - Once each device completes, we search for any UpdateDevice records with STATE not set to COMPLETED.
# - If 0 are returned, we also mark the UpdateStatus record as COMPLETE and send an MQTT broadcast
#   marking the state as done (so a UI can be updated).
#
# NOTE: we need to create an IOT rule that routes update result calls to this lambda so we can update
# the status record.
#
# NOTE: for local gateway caching, all the rest stays the same. The gateway subscribes to the same
# topic (updates, then checks to see if payload is in its cache -- if not, it downloads them then
# queues up MQTT calls until the download is done.
#

#
# For each target device, we mark it as ACTIVE, then format an IOT message and publish it.
# Devices that receive the message can directly process the message and then return the update
# status in another message, OR just do a device check the next time, and if there's a pending
#
#
def process_all_targets(target_list):
    target = None

    ldebug(f"Processing all update targets")
    for target in target_list:
        device = target.device
        ldebug(f"Processing update for device: {device.serial_number}")
        target.state = UpdateState.ACTIVE.value
        commit()
        if publish_mqtt_update(target):
            ldebug(f"MQTT update sent for: {device.serial_number}")
        else:
            target.state = UpdateState.ERROR.value
            commit()


#
# This is called to publish an update event, when it arrives from the API.
# Data changes that arrive via MQTT get republished to a general 'monitor'
# topic, along with formatted metadata from the database.
#
def publish_mqtt_update(target):
    result = False

    project = target.device.project.name
    device = target.device
    serial_number = device.serial_number
    model = device.model.name
    firmware = target.firmware

    # if device is attached to a gateway, the message should go to the gateway instead of the device
    # itself.
    #
    mqtt_topic = f"simpleiot_v1/adm/update/{project}/{model}/{serial_number}"
    payload = {
        "device": serial_number,
        "model": model,
        "version": firmware.version,
        "url": firmware.payload_url,
        "force": firmware.force_update,
        "md5": firmware.md5_hash
    }
    payload_str = json.dumps(payload, indent=2)
    ldebug(f"Sending IOT update to {mqtt_topic} with payload: {payload_str}")
    if iotclient:
        response = iotclient.publish(
            topic=mqtt_topic,
            qos=1,
            payload=payload_str
        )
        result = True
    else:
        ldebug("ERROR: boto3 iot client not initialized")

    return result


#
# Uploading a firmware update file is a multi-step process:
#
# 1. Generate a pre-signed S3 URL for uploading the firmware file.
# 2. Client uploads the file to that URL.
# 3. Call back with a confirmation when the file is loaded. We can validate the file if we want,
#    but this is where we go delete any old 3D model files, invalidate the URL in CloudFront,
#    then update the DB record so it points at the CloudFront entry.
#
# We do steps 1 and 3 via the same POST call, with the first one generating a pre-signed URL
# and a session ID. When the file has been uploaded, they call back POST again, this time
# with the item set to "payload" and we now go find the item in the S3 bucket, and do what has
# to happen as part of Step 3. If any of these fail, we leave the Model DB record alone.
# We'll want to have a way to clean out the session records that are never called back (orphaned).
#
# The URL placed in the Model record will be the Cloudfront-accessible URL
#
# If model already has an 3D GLB/USD/USDZ file in the record, we have to go and delete it,
# then we generate a pre-signed URL for uploading to a new spot and overwrite the old one.
#
# POST (item)
#   upload: returns a pre-signed URL to which the payload can be uploaded
#   payload: called when the payload has been uploaded to S3. This creates the Firmware record.
#   session: starts an update session, using a payload ID. This creates a range of UpdateDevice
#           records and sends them all notifications.
#
@db_session
def add_record(params):
    code = 200
    result = {}

    try:
        item = params.get("item", None)
        if item:
            ldebug(f"Performing ADD on item: {item}")
            if item == "upload":
                code, result = add_upload_file(params)
            elif item == "payload":
                code, result = add_payload(params)
            elif item == "session":
                code, result = add_session(params)
            else:
                code = 418
                result = {"status": "error", "message": "Invalid parameter value for 'item' not found"}
        else:
            code = 418
            result = {"status": "error", "message": "Parameter 'item' not specified"}

    except Exception as e:
        log.error(f"Error creating Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


@db_session
def return_update_data(params):
    """
    Called with the GET REST call to retrieve one or more records.
    :param params:
    :return:
    """

    code = 200
    result = {}
    # try:
    # model = None
    #     project = None
    #
    #     if params:
    #         project = find_project(params)
    #         if project:
    #             model = find_model(params, project)
    #             if model:
    #                 log.debug(f"Got model: {model.name}")
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
    #     log.error(f"Error Getting Model: {str(e)}")
    #     code = 500
    #     result = {"status": "error", "message": str(e)}
    #     traceback.print_exc()
    #
    # print(f"Returning result: {result}")
    return code, json.dumps(result)


@db_session
def set_update_data_position(params):
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
def erase_update_data(params):
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
    #     log.error(f"Error deleting Model: {str(e)}")
    #     code = 500
    #     result = {"status": "error", "message": str(e)}

    return code, json.dumps(result)


#
# This is invoked by devices that want to do a periodic update check. They
# are required to send down their project name or id, serial number, and
# current version. We use that to check and see if there are any updates
# for this device. Note that all of these operations can also be invoked
# from REST calls via GET, POST, and PUT calls so devices that are connected
# not via MQTT but HTTPS can also perform these operations.
#
# The common payload format is:
#
# {
#     "project" : project_name,
#     "serial": device serial number,
#     "version": current version of firmware,
#     "force": boolean flag indicating whether version matching should be done.
#     "op" : "check | received | installed"
# }
#

def update_check(params):
    code = 200
    result = {}
    target = None
    device_version = None
    result_update = None

    try:
        ldebug("Adding a new UpdateSession")

        project = find_project(params)
        if project:
            device = find_device(params, project)
            if device:
                log.debug(f"Got device: {device.serial_number}")

                device_version_str = params.get("version", None)
                if device_version_str:

                    # If semantic versioning is used, we validate its syntax.
                    # If not, we just take it as it is. See above for caveats on
                    # NOT using semantic versioning.
                    #
                    if USE_SEMVER:
                        device_version = semantic_version.Version(device_version_str)
                    else:
                        device_version = device_version_str

                force = params.get("force", False)

                # We look for all UpdateTarget records pointing at this device and in an ACTIVE state.
                # If there are more than one, we sort them by order data. Then we compare their version
                # with the device version of the device. If the device is lower than the UpdateTarget
                # record, then it needs to upgrade and we send it over. Note that since the versions are
                # in semantic-version format, we can't do a strict string check.
                #
                # If the 'force' flag was set, we don't do the version comparison check and return the latest
                # version.

                target_records = UpdateTarget.select(lambda t: t.device == device and
                                               t.state == UpdateState.ACTIVE.value).order_by(UpdateTarget.date_created)
                for one_target in target_records:

                    # if forced, we return the more recent update record.
                    if force:
                        result_update = one_target
                        break

                    target_version_str = one_target.firmware.version

                    if USE_SEMVER:
                        target_version = semantic_version.Version(target_version_str)
                        if device_version < target_version:
                            result_update = one_target
                            break
                    else:
                        # If no semantic versioning, we just take the newest one.
                        # This is a REALLY bad idea (and we're only keeping it here for a demo).
                        # But it's there to allow devices with non-semver versioning to go through.
                        # A better way would be to define device classes and provide their own
                        # version comparison routines.
                        #
                        result_update = one_target
                        break

                # If we have a candidate, return it to the caller as an MQTT 'update' message.
                if result_update:
                    publish_mqtt_update(result_update)
                    code = 200
                    result = {"status": "ok", "message":
                        f"Update sent to {result_update.device.serial_number} for version: {target_version_str} "}
            else:
                code = 418
                result = {"status": "error", "message": "Device serial number missing"}
        else:
            code = 418
            result = {"status": "error", "message": "Project name or ID missing"}

    except Exception as e:
        ldebug(f"Error checking for update: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, result


def update_received_or_installed(params, update_state):
    code = 200
    result = {}
    device_version = None
    device_version_str = ""

    try:
        ldebug("Adding a new UpdateSession")

        project = find_project(params)
        if project:
            device = find_device(params, project)
            if device:
                log.debug(f"Got device: {device.serial_number}")

                device_version_str = params.get("version", None)
                if USE_SEMVER:
                    if device_version_str:
                        device_version = semantic_version.Version(device_version_str)
                else:
                    device_version = device_version_str

                    # We first go get all the ACTIVE updates for this device
                    #
                    updates = UpdateTarget.select(lambda t: t.device == device and
                                                  t.state == UpdateState.ACTIVE.value)

                    if len(updates) > 0:
                        for update in updates:
                            if USE_SEMVER:
                                update_version = semantic_version.Version(update.firmware.version)
                                if update_version == device_version:
                                    update.state = update_state.value
                                    break
                            else:
                                if device_version == update.firmware.version:
                                    update.state = update_state.value
                                    break

                        commit()
                        code = 200
                        result = {"status": "success",
                                  "message": f"Updated record for device {device.serial_number} for version {device_version_str} to {device_version_str}"
                        }
                    else:
                        code = 418
                        result = {"status": "error",
                                  "message": f"No device update for {device.serial_number} with version {device_version_str} found"
                                  }
            else:
                code = 418
                result = {"status": "error", "message": "Device serial number missing"}
        else:
            code = 418
            result = {"status": "error", "message": "Project name or ID missing"}

    except Exception as e:
        ldebug(f"Error checking for update: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, result

#
# This is called when a device has sent us a status indicating it has received the update.
# Note that this is different than when it's installed. All devices can tell us that the update
# was properly received, but once the firmware is installed they need to reboot now into the
# new version. But some devices can't tell between a normal reboot and a first reboot after
# an update. This means we can't rely on the "INSTALLED" signal, but we can rely on the
# RECEIVED signal. If a device fails to return at least the RECEIVED state, the next time
# they ask if there is an update, they'll re-receive the same update record and will fall
# into an endless update loop.
#
# The packet being returned is:
#
# {
# "project": project_name,
#     "serial": device_serial_number,
#     "version": current_version_of_firmware
#     "op": "received"
# }
#
def update_received(params):
    ldebug("Setting UpdateTarget record to RECEIVED")
    code, result = update_received_or_installed(params, UpdateState.RECEIVED)
    return code, result

#
# This version does the same, but it marks the record as "INSTALLED" for those devices
# capable of returning the INSTALLED signal.
#
def update_installed(params):
    ldebug("Setting UpdateTarget record to INSTALLED")
    code, result = update_received_or_installed(params, UpdateState.INSTALLED)
    return code, result

#
# This is called when an IOT rule invokes this lambda. There's no HTTP message in that case,
# so we pass it on to this routine. The messages involve requests sent through MQTT
# so the transmitter is assumed to have security via X.509 certificates instead HTTPS.
#
# The primary action is for a device (gateway or end-node) to check if a device needs an
# update. We check this by looking for UpdateTargets that match serial numbers, and are
# active. We can also check to see if the sent version matches or is less than the version
# in the UpdateTarget. If true, we generate an IOT response that tells the target to
# perform an update, along with the payload (which includes the URL of the actual payload).
#
# All calls to simpleiot_v1/app/update/... route to here. We distinguish between them via the
# "action" parameter in the payload.
#
# The 'action' parameters can be:
#
# check: to check if this device needs an update. If so, we publish back a 'doupdate'
# message to the device. We check in the UpdateTarget list for any update addressed
# to the listed device. If we find multiple records (likely), we check to see which
# ones are the latest, if the device firmware is less than the value of the update
# record AND have the state set to "pending." If the check call came in with
# a 'force' flag set to true, then we don't do the version state check and the version
# and just return with the highest version record.
#
# received: when a device has downloaded the binary payload, they will send a 'received'
# message to acknowledge that they've gotten the payload.
#
# installed: this is an optional call. If a device is capable of distinguishing between
# a normal boot and a boot-after-update state, they could use this to signal that the
# update was installed.
#
# For now, however, we stop sending back updates if we get a 'received' message, we assume
# the installation will go as planned.
#
# If not, the device can FORCE an update by doing a "CHECK" with a "force" flag set to
# true.

@db_session
def process_iot_request(params):
    result = {}
    code = 500

    try:
        param_str = json.dumps(params)
        ldebug(f"Responding to IOT Data MQTT request: payload: {param_str}")
        op = params.get("op", None)
        if op:
            if op == "check":
                code, result = update_check(params)
            elif op == "received":
                code, result = update_received(params)
            elif op == "installed":
                code, result = update_installed(params)
            else:
                code = 418
                result = json.dumps(
                    {"status": "error", "message": "Invalid operation command"})

    except Exception as e:
        lerror(f"ERROR accessing record via MQTT: {str(e)}")
        code = 500
        result = json.dumps({"status": "error", "message": str(e)})

    return code, result


def lambda_handler(event, context):
    result = ""
    code = 200
    method = ""

    try:
        method = event.get("httpMethod", None)  # HTTP RESTful calls
        if method:
            linfo(f"METHOD: {method}")
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
        else:
            # Lambda call doesn't have an HTTP Method, so we assume it came here via IOT rule.
            #
            code, result = process_iot_request(event)

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
