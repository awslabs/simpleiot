# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
import json
from faker import Faker
from sshtunnel import SSHTunnelForwarder
from urllib.parse import urljoin
import urllib.parse
import requests
import logging
import boto3
import tempfile
import pathlib
import zipfile
import shutil
from boto3.s3.transfer import S3Transfer
from botocore.exceptions import ClientError
import os, sys, threading, uuid
import traceback
from iotapp.params import *

from pony.orm import *
from schema.dbschema import *

# This is needed to import utilities from a common parent folder.
#
import sys
import os
SCRIPT_DIR = os.path.dirname(os.path.realpath(os.path.join(os.getcwd(), os.path.expanduser(__file__))))

PACKAGE_PARENT = '..'
sys.path.append(os.path.normpath(os.path.join(SCRIPT_DIR, PACKAGE_PARENT)))

# IOTAPP_PATH = "../iotcdk/lib/lambda_src/layers/iot_app_layer/python/lib/python3.8/site-packages/iotapp"
# sys.path.append(os.path.normpath(os.path.join(SCRIPT_DIR, IOTAPP_PATH)))
#
from util.config import *   # Shared config routines between subsystems


DB_DEBUG = False

Faker.seed(0)
fake = Faker()


def slashed(url):
    if not url.endswith("/"):
        url = url + "/"
    return url

# For detailed DB logging

if DB_DEBUG:
    logging.basicConfig()

#
# NOTE: the database password comes out of secrets manager and will be rotated by KMS so
# we have to get the latest one each time we run this.
#
def create_database(config, ssh_tunnel):
    print("--Connecting via Postgres Engine")
    try:
        db_user = config.get('db_username', None)
        db_password_key = config.get("db_password_key")
        raw_db_secret = get_secret(config, db_password_key)
        if not raw_db_secret:
            print(f"ERROR: database credentials for key {db_password_key} not found in SecretsManager")
            exit(1)

        db_password = raw_db_secret.get('password', None)
        if not db_password:
            print(f"ERROR: password for key {db_password_key} not found in SecretsManager")
            exit(1)

        # In case database needs passwords to be processed
        # db_password = urllib.parse.quote_plus(db_password)

        db_name = config.get('db_name', None)
        db_type = config.get("db_type", None)

        # pony.options.CUT_TRACEBACK = False
        db.bind(db_type,
                user=db_user,
                password=db_password,
                port=ssh_tunnel.local_bind_port,
                host=ssh_tunnel.local_bind_host,
                database=db_name)

        print("--Connected to database via SSH tunnel")
        print("--Deleting existing tables and re-creating new ones")

        db.generate_mapping(create_tables=False, check_tables=False)
        db.drop_all_tables(with_all_data=True)
        db.create_tables()
    except Exception as e:
        print(f"ERROR: could not create database: {str(e)}")
        exit(1)


@db_session
def populate_database(config):
    print("--Loading mock data")
    preload_file = config.get('db_preload_file', None)
    if preload_file:
        try:
            with open(preload_file, 'r') as infile:
                data = json.load(infile)
                load_database(config, data)
        except Exception as e:
            print(f"ERROR loading {preload_file}: {str(e)}")
            exit(1)


def load_database(config, data):

    aws_profile = config.get("aws_profile", None)
    if aws_profile:
        boto3.setup_default_session(profile_name=aws_profile)

    projects = load_projects(data)
    models = load_device_models(data, projects)
    devices = load_devices(data, models)
    device_data_types = load_device_data_types(data, models)
    device_data = load_device_data(data, projects, devices, device_data_types)

    roles = load_roles(config, data)
    users = load_users(config, data, roles)
    templates = load_templates(config, data)
    generators = load_generators(config, data)
    load_system_settings(config, data)


@db_session
def load_projects(data):
    print("---Loading Projects")
    project_list = {}
    project_data = data.get("Project", None)
    if project_data:
        for proj in project_data:
            proj_name = proj.get("name", "")
            proj_desc = proj.get("desc", "")
            one = Project(name=proj_name,
                          desc=proj_desc)
            project_list[proj_name] = one

    return project_list

@db_session
def load_device_models(data, projects):
    print("---Loading Device Models")
    model_list = {}
    model_data = data.get("Model", None)
    if model_data:
        for dt in model_data:
            dt_project_str = dt.get("project", "")
            dt_project = projects.get(dt_project_str, None)
            dt_model = dt.get("model", "")
            dt_revision = dt.get("revision", "")
            dt_displayname = dt.get("display_name", "")
            dt_displayorder = dt.get("display_order", 0)
            dt_desc = dt.get("desc", "")
            dt_imageurl = dt.get("image_url", "")
            dt_iconurl = dt.get("icon_url", "")
            dt_has_digital_twin = dt.get("has_digital_twin", False)
            dt_has_location_tracking = dt.get("has_location_tracking", False)
            dt_tracker_name = dt.get("tracker_name", "")
            dt_twin3d_model_url = dt.get("twin3d_model_url", "")
            dt_env_img_url = dt.get("env_img_url", "")
            dt_sky_box_url = dt.get("sky_box_url", "")
            dt_require_position = dt.get("require_position", False)
            dt_hw_version = dt.get("hw_version", "")

            dt_model_type = dt.get("type", "device")
            dt_model_protocol = dt.get("protocol", "mqtt")
            dt_model_connection = dt.get("connection", "direct")
            dt_model_ml = dt.get("ml", "none")
            dt_model_security = dt.get("security", "device")
            dt_model_storage = dt.get("storage", "none")

            dt_type = enum_from_str(ModelType, dt_model_type)
            dt_protocol = enum_from_str(ModelProtocol, dt_model_protocol)
            dt_connection = enum_from_str(ModelConnection, dt_model_connection)
            dt_ml = enum_from_str(ModelML, dt_model_ml)
            dt_security = enum_from_str(ModelSecurity, dt_model_security)
            dt_storage = enum_from_str(ModelStorage, dt_model_storage)

            dt_update_push_via_str = dt.get("update_push_via", "none")
            dt_update_push_via = enum_from_str(UpdatePushVia, dt_update_push_via_str)

            dt_provision_location_str = dt.get("provision_location", "none")
            dt_provision_location = enum_from_str(ProvisionLocation, dt_provision_location_str)

            dt_provision_by_str = dt.get("provision_by", "none")
            dt_provision_by = enum_from_str(ProvisionBy, dt_provision_by_str)

            dt_provision_via_str = dt.get("provision_via", "none")
            dt_provision_via = enum_from_str(ProvisionVia, dt_provision_via_str)

            dt_provision_flow_str = dt.get("provision_flow", "none")
            dt_provision_flow = enum_from_str(ProvisionFlow, dt_provision_flow_str)

            if dt_project:
                one = Model(model_project=dt_project,
                                  name=dt_model,
                                  desc=dt_desc,
                                  revision=dt_revision,
                                  display_name=dt_displayname,
                                  display_order=dt_displayorder,
                                  image_url=dt_imageurl,
                                  icon_url=dt_iconurl,
                                  has_digital_twin=dt_has_digital_twin,
                                  has_location_tracking=dt_has_location_tracking,
                                  tracker_name=dt_tracker_name,
                                  twin3d_model_url=dt_twin3d_model_url,
                                  env_img_url=dt_env_img_url,
                                  sky_box_url=dt_sky_box_url,
                                  require_position=dt_require_position,
                                  model_type=dt_type,
                                  model_protocol=dt_protocol,
                                  model_connection=dt_connection,
                                  model_ml=dt_ml,
                                  model_security=dt_security,
                                  model_storage=dt_storage,
                                  update_push_via=dt_update_push_via,
                                  provision_location=dt_provision_location,
                                  provision_by=dt_provision_by,
                                  provision_via=dt_provision_via,
                                  provision_flow=dt_provision_flow,
                                  hw_version=dt_hw_version,)
                model_list[dt_model] = one

    return model_list

@db_session
def load_devices(data, models):
    print("---Loading Devices")
    device_list = {}
    device_data = data.get("Device", None)
    if device_data:
        for dev in device_data:
            device_serial = dev.get("serial_number", fake.pystr_format())
            device_name = dev.get("name", None)
            device_model_str = dev.get("model", None)
            if not device_model_str:
                print(f"ERROR: missing device_model for device: {device_serial}")
                continue

            device_model = models.get(device_model_str, None)
            if not device_model:
                print(f"ERROR: invalid model {device_model_str} specified for device: {device_serial}")
                continue
            device_desc = dev.get("desc", "")

            one = Device(serial_number=device_serial,
                         name=device_name,
                         desc=device_desc,
                         model=device_model,
                         device_project=device_model.model_project)
            device_list[device_serial] = one

    return device_list

@db_session
def load_device_data_types(data, models):
    print("---Loading Device Data Type")
    type_list = {}
    device_data_type = data.get("DataType", None)
    if device_data_type:
        for type in device_data_type:
            type_name = type.get("name", None)
            data_type_model = type.get("model", "")
            if not data_type_model:
                print(f"ERROR: missing model for DataType: {type_name}")
                continue

            model = models.get(data_type_model, None)
            if not model:
                print(f"ERROR: model {data_type_model} not found for DataType: {type_name}")
                continue

            type_desc = type.get("desc", "")
            units = type.get("units", "")
            show_on_twin = type.get("show_on_twin", "")
            data_type = type.get("data_type", "")
            data_position = type.get("data_position", "")
            data_normal = type.get("data_normal", "")
            label_template = type.get("label_template", "")
            ranges = type.get("ranges", "")

            one = DataType(model=model,
                                 name=type_name,
                                 desc=type_desc,
                                 data_type=data_type,
                                 units=units,
                                 show_on_twin=show_on_twin,
                                 data_position=data_position,
                                 data_normal=data_normal,
                                 label_template=label_template,
                                 ranges=ranges)
            type_list[type_name] = one

    return type_list


@db_session
def load_device_data(data, projects, devices, data_types):
    project = None
    model = None
    type = None
    name = None
    data_list = {}

    print("---Loading Device Data")
    device_data = data.get("Data", None)
    if device_data:
        for data in device_data:
            project_str = data.get("project", None)
            if not project_str:
                print(f"ERROR: missing project name {project_str}")
                continue
            else:
                project = projects.get(project_str, None)

            serial = data.get("serial", "")
            if not serial:
                print(f"ERROR: missing device serial {serial}")
                continue
            else:
                device = devices.get(serial, None)

            name_str = data.get("name", None)
            if not name_str:
                print(f"ERROR: missing data type name: {name_str}")
                continue
            else:
                type = data_types.get(name_str, None)
                if type:
                    name = type.name
                else:
                    print(f"ERROR: bad data type name: {name_str}")
                    continue

            value = data.get("value", "")
            position = data.get("position", "")
            dimension = data.get("dimension", "")

            one = Data(value=value,
                         type=type,
                         position=position,
                         dimension=dimension,
                         device=device)
            commit()
            data_list[one.id.hex] = one

    return data_list


# Default system settings
@db_session
def load_system_settings(config, data):
    print("---Loading System Settings")
    settings_data = data.get("SystemSettings", None)
    if settings_data:
        for setting in settings_data:
            setting_name = setting.get("name", None)
            setting_value = setting.get("value", None)
            setting_desc = setting.get("desc", "")
            if setting_name and setting_value:
                one = SystemSetting(name=setting_name, value=setting_value, desc=setting_desc)
                commit()

    # In addition, we load all the config settings into the system so it can be used by
    # lambdas.
    #
    for key, value in config.items():
         SystemSetting(name=str(key), value=str(value))


# NOTE: we may want to overlay application roles with IAM roles...

@db_session
def load_roles(config, data):
    use_sso = config.get("use_sso", False)
    if use_sso:
        print("--- Using SSO: Skipping Loading Roles. Please specify roles in SSO.")
        return None
    else:
        print("---Loading Roles")
        role_list = {}
        role_data = data.get("Role", None)
        if role_data:
            for role in role_data:
                role_name = role.get("name", "")
                role_desc = role.get("desc", "")
                role_is_admin = role.get("is_admin", False)
                one = Role(name=role_name,
                           desc=role_desc,
                           is_admin=role_is_admin)
                role_list[role_name] = one

        return role_list


#### NOTE: load_users will also create Cognito users

@db_session
def load_users(config, data, roles):
    use_sso = config.get("use_sso", False)
    if use_sso:
        print("--- Using SSO: Skipping Loading Cognito Users. You need to add users in SSO.")
        return None
    else:
        print("---Loading Users")
        user_list = {}

        region = config.get("region", None)
        aws_profile = config.get("aws_profile", None)
        client_id = config.get("cognitoClientId", None)
        user_pool_id = config.get("cognitoUserPoolId", None)
        admin_username = config.get("admin_username", None)
        boto3.setup_default_session(profile_name=aws_profile)

        team_name = config.get("team", None)
        param_name = f"/simpleiot/{team_name}/admin_password"
        admin_password = get_param(param_name, aws_profile)
        if not admin_password:
            admin_password = config.get("admin_password")

        if not admin_password:
            print(f"ERROR: no admin password found for user {admin_username}")
            exit(1)
        else:
            admin_desc = "Administrative User"
            admin_email = config.get("admin_email", None)
            admin_role = "Administrator"

            if admin_username and admin_password:
                try:
                    admin_user = create_cognito_user(roles,
                                             region,
                                             client_id,
                                             user_pool_id,
                                             admin_username,
                                             admin_desc,
                                             admin_password,
                                             admin_email,
                                             admin_role)
                    if admin_user:
                        user_list[admin_username] = admin_user
                except Exception as e:
                    print("ERROR creating administrative user: " + str(e))

        print(f"admin user: {admin_username} created with initial password: [{admin_password}]")

        print(f"\nYou will need this for logging in through console or dashboard.")
        print(f"You can change it via the Cognito dashboard on the AWS console.")

        # Now let's see if there are extra users defined in the config preload file
        #
        user_data = data.get("User", None)

        if user_data:
            for user in user_data:
                try:
                    user_name = user.get("username", "")
                    user_password = user.get("password", None)

                    # If no password specified, we use SecretsManager to create one
                    if not user_password:
                        user_password = generate_login_password(config)

                    user_email = user.get("email", None)

                    # If not user specified, we use the admin email they entered during install
                    #
                    if not user_email:
                        admin_email = config.get("admin_email", None)
                        user_email = admin_email

                    user_desc = user.get("desc", "")
                    user_roles = user.get("roles", "")
                    one_user = create_cognito_user(roles,
                                           region,
                                           client_id,
                                           user_pool_id,
                                           user_name,
                                           user_desc,
                                           user_password,
                                           user_email,
                                           user_roles)
                    if one_user:
                        user_list[user_name] = one_user
                except Exception as e:
                    print(f"ERROR creating user '{user_name}: {str(e)}")

        return user_list


# This function creates both the User record in our own database AND the associated
# Cognito user. Since this is for pre-loading and testing, we confirm the user's password.
# Ordinarily, they would have to go through a password reset-cycle.
#
def create_cognito_user(roles, region, client_id, user_pool_id, username, desc, password, email, role_str):
    role_array = role_str.split(",")
    role_list = []
    one = None

    for role_str in role_array:
        role = roles.get(role_str, None)
        if not role:
            print(f"ERROR: invalid role specified {role_str} for user {username}")
            continue
        role_list.append(role)

    try:
        if region and user_pool_id and email and password:
            one = User(name=username,
                       desc=desc,
                       roles=role_list)
            cognito = boto3.client('cognito-idp', region_name=region)
            cognito.admin_create_user(UserPoolId=user_pool_id,
                                      Username=username,
                                      TemporaryPassword=password,
                                      DesiredDeliveryMediums=['EMAIL'],
                                      UserAttributes=[
                                          {"Name": "email", "Value": email},
                                          {"Name": "email_verified", "Value": "true"}
                                      ])

            auth_result = cognito.admin_initiate_auth(UserPoolId=user_pool_id,
                                                      ClientId=client_id,
                                                      AuthFlow='ADMIN_NO_SRP_AUTH',
                                                      AuthParameters={
                                                          "USERNAME": username,
                                                          "PASSWORD": password
                                                      })
            if auth_result:
                session = auth_result['Session']
                response = cognito.admin_respond_to_auth_challenge(UserPoolId=user_pool_id,
                                                                   ClientId=client_id,
                                                                   ChallengeName='NEW_PASSWORD_REQUIRED',
                                                                   Session=session,
                                                                   ChallengeResponses= {
                                                                       "USERNAME": username,
                                                                       "NEW_PASSWORD": password
                                                                   })




    except Exception as e:
        print(f"ERROR: Could not create user {username} in Cognito: {str(e)}")
        one = None

    return one


def generate_login_password(config):
    password = None

    try:
        region = config.get("region", None)
        if region:
            session = boto3.session.Session()
            sm = session.client('secretsmanager', region)
            response = sm.get_random_password(PasswordLength=18,
                                              ExcludeCharacters="",
                                              ExcludeNumbers=False,
                                              ExcludePunctuation=False,
                                              ExcludeUppercase=False,
                                              ExcludeLowercase = False,
                                              IncludeSpace=False,
                                              RequireEachIncludedType=True)
            password = response['RandomPassword']

        return password

    except ClientError as e:
        raise Exception("boto3 client error in generate_random_password: " + e.__str__())
    except Exception as e:
        raise Exception("Unexpected error in generate_random_password: " + e.__str__())

#### Templates

@db_session
def load_templates(config, data):
    print("---Loading Templates")
    template_list = {}
    template_data = data.get("Template", None)
    if template_data:
        for template in template_data:
            template_name = template.get("name", "")
            template_desc = template.get("desc", "")
            template_icon = template.get("icon", "")
            template_author = template.get("author", "")
            template_email = template.get("email", "")
            template_dev_url = template.get("dev_url", "")
            template_license = template.get("license", "")
            template_zip_url = template.get("zip_url", "")
            template_value = template.get("value", None)

            if template_value:
                template_value_str = json.dumps(template_value)

            one = Template(name=template_name,
                           desc=template_desc,
                           icon_url=template_icon,
                           author=template_author,
                           email=template_email,
                           dev_url=template_dev_url,
                           license=template_license,
                           zip_url=template_zip_url,
                           value=template_value_str
                           )
            template_list[template_name] = one

    return template_list

#
# Generators require uploading locally specified ZIP files up to S3 and
# then loading the URL on S3 into the database.
#
# This class updates upload progress and displays it on the console.
#
class UploadProgress(object):
    def __init__(self, filename):
        self._filename = os.path.basename(filename)
        self._size = float(os.path.getsize(filename))
        self._seen_so_far = 0
        self._lock = threading.Lock()

    def __call__(self, bytes_amount):
        # To simplify we'll assume this is hooked up
        # to a single filename.
        with self._lock:
            self._seen_so_far += bytes_amount
            percentage = (self._seen_so_far / self._size) * 100
            sys.stdout.write(
                "\r%s  %s / %s  (%.2f%%)" % (
                    self._filename, self._seen_so_far, self._size,
                    percentage))
            sys.stdout.flush()
            sys.stdout.write("\r\n")

#
# Utility routine to generate a temporary zip directory from a base path
#
# Except the zip file should start from the 'template' root and go down.
# Also, we'll want to have different files for different directories. So instead
# of starting at "template" we'll want to start at the next level down so we can
# have multiple ones for different applications, and templates for same app for
# different OS and architectures.
#
def generate_zip_file(source_path):
    root_path = pathlib.PurePath(source_path)
    zip_file_name = f"{root_path.name}"  # take the last entry in the directory
    tmpdir = tempfile.mkdtemp()
    gen_zip_file = os.path.join(tmpdir, zip_file_name)
    shutil.make_archive(gen_zip_file, 'zip', source_path)
    return_file = f"{gen_zip_file}.zip"
    # print(f"Generated: {return_file}")
    return return_file

@db_session
def load_generators(config, data):
    print("---Loading Generators")
    generator_list = {}
    gen_zip_file_abs = None
    gen_file_url = None

    generator_data = data.get("Generator", None)
    if generator_data:
        for generator in generator_data:
            gen_name = generator.get("name", "")
            gen_desc = generator.get("desc", "")
            gen_author = generator.get("author", "")
            gen_icon = generator.get("icon", "")
            gen_contact_email = generator.get("contact", "")
            gen_source_root = generator.get("source_root", None)
            #
            # NOTE: this is assumed to be a relative path from the DB
            #
            if gen_source_root:
                gen_source_root_abs = os.path.abspath(gen_source_root)

            gen_upload_filename = generator.get("upload_filename", None)
            gen_manufacturer_str = generator.get("manufacturer", "any")
            gen_processor_str = generator.get("processor", "none")
            gen_os_str = generator.get("os", "none")

            gen_manufacturer = enum_from_str(GeneratorManufacturer, gen_manufacturer_str)
            gen_processor = enum_from_str(GeneratorProcessor, gen_processor_str)
            gen_os = enum_from_str(GeneratorOS, gen_os_str)
            if gen_source_root_abs:
                gen_zip_file_abs = generate_zip_file(gen_source_root)
            else:
                print(f"No source root specified for generator. Skipping")
                continue

            gen_upload_filename = os.path.basename(gen_zip_file_abs)

            # The installer should have created this
            #
            bucket = config.get("generatorBucketName", None)
            if not bucket:
                print(f"ERROR: no generator bucket name found. Perhaps the installer didn't finish properly? Skipping.")
                continue
            if not gen_upload_filename:
                print(f"ERROR: could not find an upload name for the file. Skipping")
                continue

            # print(f"Uploading {gen_zip_file} to S3 bucket {bucket} as {gen_upload_filename}...")
            s3 = boto3.client('s3', config.get("region"))
            transfer = S3Transfer(s3)
            upload_args = {"ContentType": "application/zip",
                           "ACL": "bucket-owner-full-control"}

            if transfer:
                try:
                    transfer.upload_file(filename=gen_zip_file_abs,
                                         bucket=bucket,
                                         key=gen_upload_filename,
                                         callback=UploadProgress(gen_zip_file_abs),
                                         extra_args=upload_args)
                    gen_file_url = f"{s3.meta.endpoint_url}/{bucket}/{gen_upload_filename}"
                except Exception as e:
                    print(f"ERROR uploading to S3: {str(e)}. Skipping.")
                    traceback.print_exc()
                    continue
            #
            # Now, we check to see if zip file exists. If it does, we push it up to the
            # S3 bucket set up for generators (defined in config file).
            #
            if not gen_file_url:
                print(f"ERROR: failed to upload generator file to S3. Skipping.")
                continue

            one = Generator(name=gen_name,
                            desc=gen_desc,
                            icon_url=gen_icon,
                            author=gen_author,
                            contact_email=gen_contact_email,
                            manufacturer=gen_manufacturer,
                            processor=gen_processor,
                            os=gen_os,
                            zip_url=gen_file_url,
                            zip_s3_bucket=bucket,
                            zip_s3_key=gen_upload_filename
            )
            generator_list[gen_name] = one

    return generator_list


def start_tunnel(config, team):

    try:
        ssh_host = config.get("bastionHostSSHDns", None)
        ssh_port = config.get("bastion_ssh_port", None)
        ssh_user = config.get("bastion_ssh_user", None)
        profile = config.get("aws_profile", None)
        certs_path = path_for_certs(team)
        ssh_keypair_filename = config.get("bastion_ssh_ec2_keypair_filename", None)
        ssh_path_to_private_key = os.path.join(certs_path, ssh_keypair_filename)
        db_host = config.get("dbHostname", None)
        db_port = config.get("database_tcp_port", None)
        ssh_db_local_port = config.get("ssh_db_local_port", None)

        # Create an SSH tunnel with our external IP set as the local address so it doesn't
        # trigger the bastion host security group rule.
        #
        # NOTE: we've had issues doing this when connected via a VPN. To make this work,
        # you need to go into the EC2 console, then go to the Security Group called
        # 'iot_dev_bastion_ssh_sg' and edit the Inbound rule for SSH. Under Source, click
        # on the 'Custom' pop-up, find 'My IP' and assign it and save the rule.
        #
        # This makes sure the rule is set up for your current IP address. Once done, you can
        # run the database loader.
        #

        ssh_tunnel = SSHTunnelForwarder(
            (ssh_host, ssh_port),
            ssh_username=ssh_user,
            ssh_private_key=ssh_path_to_private_key,
            remote_bind_address=(db_host, db_port),
            local_bind_address=('0.0.0.0', ssh_db_local_port))

        # Needed so tunnel doesn't hang process on close - this should be before start()
        ssh_tunnel.daemon_forward_servers = True

        # Now let's start the tunnel
        ssh_tunnel.start()

        # Needed so tunnel doesn't hang process on close - this should be after start()
        ssh_tunnel._server_list[0].block_on_close = False
        return ssh_tunnel
    except Exception as e:
        print(f"ERROR establishing secure SSH tunnel to database: {str(e)}")
        exit(1)

# Stop SSH tunnel on shutdown
#
def stop_tunnel(ssh_tunnel):
    ssh_tunnel.stop()

#
# If you need to get the local IP address, this returns it.
#
# def get_my_ip():
#     # We need to get our external IP address to pass down to
#     # the bastion host security group. If it's not accessible, it could cover
#     # a bigger problem. Note that if you move to a different location and try to
#     # update the database via the bastion host, the security group will likely
#     # prevent you from being able to access the bastion host and database.
#     #
#     my_ip = None
#     get_ip = requests.get("https://checkip.amazonaws.com/")
#     if get_ip.status_code == 200:
#         my_ip = get_ip.text.rstrip()
#
#         # The remote call sometimes returns two values with a comma, so we
#         # only take the first one.
#         #
#         if "," in my_ip:
#             ip_list = my_ip.split(",")
#             my_ip = ip_list[0].rstrip()
#
#     if not my_ip:
#         print("ERROR: could not obtain external IP address, needed for bastion host access")
#         exit(1)
#
#     return my_ip



if __name__ == '__main__':
    team = None

    if len(sys.argv) > 1:
        team = str(sys.argv[1])
        print(f"Initializing database with Team '{team}'")
        config = load_config(team)
        tunnel = start_tunnel(config, team)
        db = create_database(config, tunnel)
        populate_database(config)
        stop_tunnel(tunnel)
        print("--All Done!")
    else:
        print(f"USAGE: python3 ./dbloader.py {team}")
