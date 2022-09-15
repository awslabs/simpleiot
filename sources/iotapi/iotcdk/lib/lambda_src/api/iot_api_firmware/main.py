# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: firmware generator
# iot_api_firmware
#
# System and project settings
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.params import *
from iotapp.logger import *
import os
import tempfile
import boto3
import shutil
import jinja2
import zipfile
import io
import gzip
import base64

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from os import PathLike
from typing import Union

from pathlib import Path
import traceback

SIMPLEIOT_IOT_ENDPOINT_KEY = "/simpleiot/iot/endpoint"

connect_database()


def format_one(rec):
    return_data = {
        "id": rec.id.hex,
        "name": rec.name,
        "manufacturer": enum_to_str(GeneratorManufacturer, rec.manufacturer),
        "processor": enum_to_str(GeneratorProcessor, rec.processor),
        "os": enum_to_str(GeneratorOS, rec.os),
    }

    if rec.desc:
        return_data['desc'] = rec.desc
    if rec.author:
        return_data['author'] = rec.author
    if rec.contact_email:
        return_data['contact_email'] = rec.contact_email
    if rec.icon_url:
        return_data['icon_url'] = rec.icon_url
    if rec.zip_url:
        return_data['zip_url'] = rec.zip_url
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


# Attempt to determine if a file is binary or text. We run template on text files only
#
def skip_run_template(filename):
    print(f"Checking {filename}")
    result = True

    try:
        textchars = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100)) - {0x7f})
        check_binary = lambda bytes: bool(bytes.translate(None, textchars))
        is_binary = check_binary(open(filename, 'rb').read(1024))
        if not is_binary:
            result = False
    except Exception as e:
        ldebug("ERROR checking binary")
        traceback.print_exc()
    return result


# To generate firmware we need to get the project and serial number.
# These are then used to look up the right model and certificates.
#
# Along these lines, we also need the generator name, id as well as the
# manufacturer, processor, and os specification.
#
# We look these to find the url of the codegen zip file (on S3).
# That is downloaded then unzipped into a temporary folder.
#
# Once those files are in place, we recurse through every file and run
# it through jinja with the values from the model/serial cert data
# made available.
#
# Finally, the generated code (along with all the certs) are zipped and
# then downloaded to the user.
#
# If wifi_ssid and wifi_password are specified, we use those.
#
# What is in the downloaded bundle matches what was in the zip file on S3
# as part of the generator list. For now, those are loaded when the database
# is initialized during install. But we will soon provide a way to manage
# generators from the API.
#

def zip_dir_to_file(zip_file_name: str, source_dir: Union[str, PathLike]):
    src_path = Path(source_dir).expanduser().resolve(strict=True)
    with ZipFile(zip_file_name, 'w', ZIP_DEFLATED) as zf:
        for file in src_path.rglob('*'):
            zf.write(file, file.relative_to(src_path.parent))


def gzip_b64encode(file):
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode='w') as f:
        json_response = json.dumps(data)
        f.write(json_response.encode('utf-8'))
    return base64.b64encode(compressed.getvalue()).decode('ascii')


def download_generator_to_temp(generator):
    s3 = boto3.resource('s3')

    temp_zip_file = tempfile.NamedTemporaryFile(dir="/tmp", delete=False)  # nosec

    with temp_zip_file as tempzip:
        bucket = generator.zip_s3_bucket
        file_name = generator.zip_s3_key
        ldebug(f"Downloading zipfile {file_name} from bucket {bucket} to temp directory")
        s3.meta.client.download_fileobj(bucket, file_name, tempzip)

    ldebug(f"Downloaded to tempzip: {temp_zip_file.name}")

    temp_generator_root = tempfile.TemporaryDirectory()
    ldebug(f"Temp generator root: {temp_generator_root.name}")
    os.chdir(temp_generator_root.name)

    ldebug(f"Extracting downloaded zip file {temp_zip_file.name} to {temp_generator_root.name}")
    with zipfile.ZipFile(temp_zip_file.name, 'r') as zip_ref:
        zip_ref.extractall(temp_generator_root.name)

    # Clean up the downloaded zip file. We pass on the directory where the source
    # template material has been extracted.
    #
    os.remove(temp_zip_file.name)

    ldebug(f"Output generator file to: {temp_generator_root.name}")
    return temp_generator_root


def process_generator(project,
                      model,
                      device,
                      version,
                      data_list,
                      generator,
                      downloaded_generator_root,
                      wifi_ssid,
                      wifi_passwword):
    file_name = None
    zip_file = None

    temproot = tempfile.mkdtemp()
    ldebug(f"Processing generator from {downloaded_generator_root} in temproot: {temproot}")
    generator_files = os.listdir(downloaded_generator_root)
    print("Generator files: " + str(generator_files))
    processor_str = enum_to_str(GeneratorProcessor, generator.processor)
    opsys_str = enum_to_str(GeneratorOS, generator.os)
    manufacturer_str = enum_to_str(GeneratorManufacturer, generator.manufacturer)

    ldebug(f"Processing generator start root: {downloaded_generator_root}")

    root_ca = None
    if device.device_ca_data:
        root_ca = device.device_ca_data
    else:
        root_ca = model.model_ca_data

    device_cert = None
    if device.device_cert_data:
        device_cert = device.device_cert_data
    else:
        device_cert = model.model_cert_data

    private_key = None
    if device.device_cert_data:
        private_key = device.device_private_key_data
    else:
        private_key = model.model_private_key_data

    iot_endpoint = get_param(SIMPLEIOT_IOT_ENDPOINT_KEY)

    # These are parameters we send to the jinja template processor.
    # The data_list is constructed from all the DataType elements
    # associated with this model. If the template wants to generate code
    # with all (or some) of the defined DataTypes, they can iterate through it
    # using Jinja's looping construct:
    #
    # {% for data in data_list %}
    #   String {{ data.name }};
    # {% endfor %}
    #
    # The values passed down will be:
    #
    #     data.name: name of data type
    #     data.type: type of data
    #     data.allow_modify: whether it's a read-only or writable variable
    #     data.show_on_twin: whether it's supposed to be shown on a twin
    #     data.udi: universal device identifier for element (TBD)
    #     data.units: any units specified when defining datatype
    #     data.label_template: string label template (see DataType for description)
    #

    # These values will all also be available inside the template for use in
    # {{ name }} constructs.
    #
    generator_data = {
        "iot_project": project.name,
        "project": project.name,
        "iot_model": model.name,
        "model": model.name,
        "iot_device_serial": device.serial_number,
        "device": device.serial_number,
        "serial": device.serial_number,
        "firmware_version": version,
        "version": version,
        "data_list": data_list,
        "manufacturer": manufacturer_str,
        "processor": processor_str,
        "os": opsys_str,
        "wifi_ssid": wifi_ssid,
        "wifi_password": wifi_passwword
    }
    #
    # Add certs and IOT endpoint so it can be folded into the source code.
    #
    if iot_endpoint:
        generator_data["iot_endpoint"] = iot_endpoint
    if root_ca:
        generator_data["simpleiot_root_ca"] = root_ca
    if device_cert:
        generator_data["simpleiot_device_cert"] = device_cert
    if private_key:
        generator_data["simpleiot_private_key"] = private_key

    # Now we go run all the files in the zip file through a jinja2 template
    # processor and substitute any of the above into the code. Then we package
    # the generated code into a zip file and return it along with the name of
    # the zip file.

    for dirpath, dirs, files in os.walk(downloaded_generator_root):
        tempdir = os.path.join(temproot, generator.name)
        # ldebug(f"Output TEMPDIR: {tempdir}")
        os.makedirs(tempdir, exist_ok=True)
        for filename in files:
            if filename.startswith('.'):
                continue

            srcname = os.path.join(dirpath, filename)

            #
            # If file is binary, we skip running it through template processor.
            #
            if skip_run_template(srcname):
                ldebug(f"File {srcname} is binary. Skipping running template.")
                continue
            #
            #
            # If it's an Arduino .ino file, the name of the file MUST match the outer directory.
            # so we rename the ino file to the name of the directory so the Arduino IDE doesn't
            # pitch a fit. Also, note that we're assuming there's only one .ino file per directory.
            # If there is more than one, this logic will have to change to allow for that.
            #
            if filename.endswith('.ino'):
                dstname = os.path.join(tempdir, f"{generator.name}.ino")
            else:
                dstname = os.path.join(tempdir, filename)

            with open(srcname, "r", encoding="utf8") as input:
                body = input.read()
            # ldebug(f">>>>>>>>>>>>>>>>>>>>>>>>>>>>")
            # ldebug(f"InFile: {srcname}\n{body}")
            # ldebug(f">>>>>>>>>>>>>>>>>>>>>>>>>>>>")
            rendered = jinja2.Template(open(srcname).read(), trim_blocks=True, lstrip_blocks=True).render(
                generator_data)
            # ldebug(f"<<<<<<<<<<<<<<<<<<<<<<<<<<<")
            # ldebug(f"OutFile: {dstname}\n{rendered}")
            # ldebug(f"<<<<<<<<<<<<<<<<<<<<<<<<<<<")

            with open(dstname, "w") as output:
                output.write(rendered)

            # ldebug(f" -- {srcname} -> {dstname}")

    output_zip_root = f"{generator.name}-{opsys_str}-{processor_str}"
    output_zip_name = f"{output_zip_root}.zip"
    output_zip_path = os.path.join(temproot, output_zip_name)
    # ldebug(f"Generating zip to path: {output_zip_path} - file: {output_zip_name} - temproot: {temproot}")

    zip_dir_to_file(output_zip_path, tempdir)

    # shutil.make_archive(base_dir=temproot, root_dir=temproot, format='zip', base_name=tempdir)

    # shutil.make_archive(output_zip_path, 'zip', tempdir)

    rootexists = os.path.exists(tempdir)
    exists = os.path.exists(output_zip_path)
    # ldebug(f"Output zip: {output_zip_path} - root: {rootexists} - exists: {exists}")

    return temproot, output_zip_name, output_zip_path


@db_session
def generate_firmware(params):
    code = 200
    result = {}
    manufacturer = None
    processor = None
    opsys = None
    generator = None
    project = None
    model = None
    device = None
    version = None
    wifi_ssid = None
    wifi_password = None

    try:
        version = params.get("version", None)
        if not version:
            version = params.get("firmware_version", "1.0.0")

        generator_id = params.get("generator_id", None)
        ldebug(f"Looking for generator with ID: {generator_id}")
        if generator_id:
            generator_uuid = uuid.UUID(generator_id)
            generator = Generator.get(id=generator_uuid)
            if generator:
                ldebug(f"Found generator: {generator.name}")
            else:
                ldebug(f"ERROR: Could not find generator with id")

        if not generator:
            ldebug(f"No generator found by ID. Continuing search...")
            manufacturer_str = params.get("manufacturer", "")
            processor_str = params.get("processor", "")
            os_str = params.get("os", "")
            generator_name = params.get("generator_name", "")
            #
            # We parse them to find out if they're supported.
            #
            if manufacturer_str:
                manufacturer = enum_from_str(GeneratorManufacturer, manufacturer_str)
            if processor_str:
                processor = enum_from_str(GeneratorProcessor, processor_str)
            if os_str:
                opsys = enum_from_str(GeneratorOS, os_str)

            ldebug(
                f"Looking for generator with Manufacturer: {manufacturer} - OS: {opsys} - Processor: {processor} - name: {generator_name}")
            generator = Generator.get(manufacturer=manufacturer,
                                      os=opsys,
                                      processor=processor,
                                      name=generator_name)
            if generator:
                ldebug(f"Found generator with data: {generator_name}")
                device_id = params.get("device_id", None)
                if device_id:
                    device_uuid = uuid.UUID(device_id)
                    device = Device.get(id=device_uuid)
                    if device:
                        ldebug(f"Found device: {device.serial_number}")
                        model = device.model
                        project = model.model_project
                    else:
                        ldebug(f"Could not find device with uuid: {device_uuid.hex}")

                # If no device found using device_id, we're going to try to get it
                # based on provided project and serial number.
                #
                if not device:
                    serial = params.get("serial", None)
                    if not serial:
                        code = 418
                        result = {"status": "error", "message": "'Serial' field missing"}
                    else:
                        ldebug(f"Getting device with serial/project/model: {serial}")
                        project = find_project(params)
                        if project:
                            device = Device.select(lambda d: d.device_project == project and
                                                             d.serial_number == serial).first()
                            if device:
                                model = device.model
                            else:
                                ldebug(f"ERROR: could not find device with serial #{serial}")
                                code = 418
                                result = {"status": "error", "message": f"Could not find device with serial #{serial}"}

                if model and device:
                    ldebug(f"Getting datatypes for model: {model.name}")
                    data_types = DataType.select(lambda dt: dt.model == model)
                    data_list = []
                    for type in data_types:
                        ldebug(f"Getting datatype details: {type.name}")
                        one = {
                            "name": type.name,
                            "allow_modify": type.allow_modify,
                            "show_on_twin": type.show_on_twin
                        }
                        udi = type.udi
                        if udi:
                            one["udi"] = udi
                        variable_type = type.data_type
                        if variable_type:
                            one["type"] = variable_type
                        units = type.units
                        if units:
                            one["units"] = units
                        label_template = type.label_template
                        if label_template:
                            one["label_template"] = label_template
                    data_list.append(one)

                    if not generator:
                        ldebug(f"ERROR: no generator of this type found")
                        code = 418
                        result = {"status": "error", "message": f"ERROR: no Generator of this type found"}
                    else:
                        ldebug(f"Downloading generator to temp for: {generator.name}")
                        downloaded_generator_root = download_generator_to_temp(generator)

                        wifi_ssid = params.get("wifi_ssid", "[[ ENTER WIFI SSID]]")
                        wifi_password = params.get("wifi_password", "[[ ENTER WIFI PASSWORD]")

                        output_root, zip_name, zip_path = process_generator(project,
                                                                            model,
                                                                            device,
                                                                            version,
                                                                            data_list,
                                                                            generator,
                                                                            downloaded_generator_root.name,
                                                                            wifi_ssid,
                                                                            wifi_password)
                        ldebug(f"Returning Generated file: {zip_name} at path: {zip_path}.")
                        if zip_name and zip_path:
                            with open(zip_path, mode='rb') as binary_file:
                                binary_content = binary_file.read()

                            res = base64.encodestring(binary_content)

                            # return {
                            #     'headers': { "Content-Type": "image/png" },
                            #     'statusCode': 200,
                            #     'body': base64.b64encode(image).decode('utf-8'),
                            #     'isBase64Encoded': True
                            # }

                            code = 200
                            result = {
                                "isBase64Encoded": True,
                                "statusCode": code,
                                "headers": {
                                    "Content-Type": "application/zip",
                                    "Content-Disposition": f"attachment; filename={zip_name}",
                                    "Content-Encoding": "gzip",
                                    "Access-Control-Allow-Origin": "*"
                                },
                                "body": base64.b64encode(binary_content).decode('utf-8')
                            }
                            result_str = json.dumps(result, indent=2)
                            ldebug(f"Returning: {result_str}")
                            return code, result
                        else:
                            ldebug(f"ERROR: error generating output zip")
                            code = 418
                            result = {"status": "error", "message": f"ERROR: error generating output zip"}

                    os.remove(zip_file)
                    downloaded_generator_root.cleanup()
                    shutil.rmtree(output_root)
                else:
                    ldebug(f"ERROR: could not find Model or Device")
                    code = 418
                    result = {"status": "error", "message": "Could not find Model or Device"}
            else:
                ldebug(f"ERROR: could not find generator for specified parameters")
                code = 418
                result = {"status": "error", "message": "Could not find generator for specified parameters"}

    except Exception as e:
        lerror(f"Error creating code: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


@db_session
def list_generators(params):
    """
    Called with the GET REST call to retrieve one or more records.
    :param params:
    :return:
    """

    code = 200
    result = {}
    try:
        #
        # Once we have a lot of generators we can filter based on manufacturer, processor, os, etc.
        #
        all_generators = Generator.select().order_by(Generator.name)
        code = 200
        result = format_all(all_generators)

    except Exception as e:
        lerror(f"Error Getting Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

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
            code, result = generate_firmware(payload)
            #
            # If this was successful, the returned data is the full lambda response with
            # the generated binary as the body. If it's an error, then it's a standard
            # JSON response, which should be returned and handled normally (below).
            # NOTE: this is only for the routine because it's generating a binary attachment as
            # a returned result.
            #
            if code == 200:
                return result
        elif method == "GET":
            params = event.get("queryStringParameters", None)
            code, result = list_generators(params)

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
