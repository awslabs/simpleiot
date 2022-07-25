# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Feature / twin
# iot_feature_api_twin
#
# Manage updating 3D Digital Twin data. This API can be used to submit
# .usdz, .glb, or .gltf files to be associated with a model.
#
# Binary file data can be uploaded via POST and headed for storage onto S3 and CloudFront.
# If a binary file for the device already exists, we delete it from S3 and replace it with
# the new one. Once uploaded to S3 we issue a CloudFront invalidation/update.
#
# To update location data for the datatypes, the name or ID of the datatypes has to be
# provided and the 3D position data updated via PUT calls.
#
# On GET if only a model is specified, we return the data on the 3D model file (mainly
# where it could be obtained, on CloudFront) plus some metadata on last updates.
#
# If a model and datatype name is specified, we'll return the current data for that item.
# If an all=true parameter is provided, we return data on all datatypes that are marked
# as 'show on twin.' This can be used to get a list of datatypes that are available for
# placement on the twin.
#
# If DELETE is specified, if a model name or ID is specified, we erase the S3 file and zero
# out the URL in the model record. If a datatype is specified, we zero out the position data
# in the datatype field. DELETEs passed through here do NOT delete the underlying Model or
# DataType object. To DELETE those records, you have to go through the iot_api_model or
# iot_api_datatype lambdas or corresponding API calls.
#

import json
import boto3
from botocore.exceptions import ClientError
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
import time
import os
import pathlib
import uuid
import traceback
import logging
from urllib.parse import urljoin, urlparse

logging.basicConfig(level=os.environ.get("IOT_LOGLEVEL", "INFO"))
log = logging.getLogger("simpleiot")
s3 = boto3.resource('s3')

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
#    to be able to call this method. Also, it would be possible to uplad a file with a malicious
#    payload. But the URL will be handed to the 3D viewer component, so rejecting potential
#    bad content could be tested there.
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


def delete_twin_model_file(model, bucket):
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
    :param fields: Dictionary of prefilled form fields
    :param conditions: List of conditions to include in the policy
    :param expiration: Time in seconds for the presigned URL to remain valid
    :return: Dictionary with the following keys:
        url: URL to post to
        fields: Dictionary of form fields and values to submit with the POST
    :return: None if error.
    """

    # Generate a presigned S3 POST URL
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
    distribution_id = get_system_setting("twinMediaCFDistributionId")
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
# Uploading a twin 3D model file is a multi-step process:
#
# 1. Generate a pre-signed S3 URL for uploading the GLB/USDZ file.
# 2. Client uploads the file to that URL.
# 3. Call back with a confirmation when the file is loaded. We can validate the file if we want,
#    but this is where we go delete any old 3D model files, invalidate the URL in CloudFront,
#    then update the DB record so it points at the CloudFront entry.
#
# We do steps 1 and 3 via the same POST call, with the first one generating a pre-signed URL
# and a session ID. When the file has been uploaded, they call back POST again, this time
# with the session ID and we now go find the item in the S3 bucket, and do what has to happen
# as part of Step 3. If any of these fail, we leave the Model DB record alone. We'll want to
# have a way to clean out the session records that are never called back (orphaned).
#
# The URL placed in the Model record will be the Cloudfront-accessible URL
#
# If model already has an 3D GLB/USD/USDZ file in the record, we have to go and delete it,
# then we generate a pre-signed URL for uploading to a new spot and overwrite the old one.
#
@db_session
def upload_twin_3d_file(params):
    code = 200
    result = {}
    model = None
    project = None
    suffix = None

    try:
        if params:
            ldebug(f"Params: {json.dumps(params)}")
            project = find_project(params)
            if project:
                model = find_model(params, project)
                print(f"Project: {project} - Model: {model}")
                if model:
                    file_name = params.get("file", None)
                    if file_name:
                        url = params.get("url", None)

                        # If no URL specified, first we go see if there already is a model file.
                        # If yes, we tell S3 to delete it.

                        model3d_bucket = get_system_setting("twinMediaBucketName")

                        if not url:
                            ldebug("No URL specified. Creating new pre-signed URL")
                            if model.twin3d_model_url:
                                delete_twin_model_file(model, model3d_bucket)

                            # file_name = uuid.uuid4().hex
                            # file_type = params.get("type", "glb")
                            # if file_type:
                            #     suffix = file_type.lower()

                            # if suffix:
                            #     file_name = f"{file_name}.{suffix}"

                            ldebug(f"Creating pre-signed URL for bucket {model3d_bucket} and file {file_name}")
                            pre_signed_url = create_presigned_url(model3d_bucket, file_name)
                            #
                            # The URL returned contains pre-signed values on the query.
                            # We extract all the queries and save that in the database since that's what
                            # is going to get used to retrieve the object. We rewrite the URL
                            # so it doesn't have the queries and points at the twinMedia Cloudfront
                            # domain.
                            #
                            if pre_signed_url:
                                model3d_domain = get_system_setting("twinMediaDomain")
                                download_url = urljoin(model3d_domain, urlparse(pre_signed_url).path)
                                # ldebug(f"Download URL: {download_url}")
                                model.twin3d_model_url = download_url
                                commit()

                                # This is what's returned. To send a file up, in Python you can use:
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

                                code = 200
                                result = {
                                    "status": "ok",
                                    "file": file_name,
                                    "url": pre_signed_url
                                }
                        else:
                            # Here, they've called us back but with a URL and filename. We check to
                            # make sure the path is the same. If there is no download URL
                            # something's gone terribly wrong.
                            #
                            # NOTE: up to this point, the URL being passed around is for the S3
                            # bucket. Once we're done, we change it so it points to the cloudfront
                            # URL for twins.
                            #
                            download_url = model.twin3d_model_url

                            if not download_url:
                                code = 418
                                result = {"status": "error", "message": "Invalid URL seen. Start over."}
                            else:
                                download_base = urlparse(download_url).path
                                upload_base = urlparse(url).path
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
                                    ## Here, we can also check to make sure the file type is .glb/.gltf/.usdz
                                    ##
                                    cloudfront_root = get_system_setting("twinMediaDomain")
                                    download_full_url = f"https://{cloudfront_root}{download_base}"
                                    ldebug(f"Download URL set to: {download_full_url}")
                                    model.twin3d_model_url = download_full_url
                                    commit()

                                    code = 200
                                    result = {
                                        "status": "ok"
                                    }
                                else:
                                    delete_twin_model_file(model, model3d_bucket)
                                    code = 418
                                    result = {"status": "error", "message": "Upload URL did not match."}
                    else:
                        code = 418
                        result = {"status": "error", "message": "Filename not specified"}
                else:
                    code = 418
                    result = {"status": "error", "message": "Model Not Found"}
            else:
                code = 418
                result = {"status": "error", "message": "Project Not Found"}


    except Exception as e:
        log.error(f"Error creating Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


@db_session
def return_twin_3d_data(params):
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
def set_twin_3d_data_position(params):
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
def erase_twin_3d_data(params):
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


def lambda_handler(event, context):
    result = ""
    code = 200
    method = ""

    try:
        method = event["httpMethod"]

        if method == "POST":
            body = event["body"]
            payload = json.loads(body)
            code, result = upload_twin_3d_file(payload)
        elif method == "GET":
            params = event.get("queryStringParameters", None)
            code, result = return_twin_3d_data(params)
        elif method == "PUT":
            params = event.get("queryStringParameters", None)
            code, result = set_twin_3d_data_position(params)
        elif method == "DELETE":
            params = event.get("queryStringParameters", None)
            code, result = erase_twin_3d_data(params)

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
