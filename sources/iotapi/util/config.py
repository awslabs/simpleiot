# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# These are common configuration management routines used by all subsystems that need
# access to configuration data.
#
# Note that a duplicate of this is in the iotcli folder so it can be run standalone
# with a minimal version of the config.json file for those who don't need to
# download the whole package.
#
# The configuration system for SimpleIOT is based on files placed in the following
# hierarchy:
#
# ~ (home directory)
#  .simpleiot (root of SimmpleIOT)
#     {team-name}
#        bootstrap.json - json file generated by the bootstrap process
#        cdkoutput.json - json file output from running the CDK
#        config.json - merged JSON file input by other subsystems
#        projects
#           {project-name}
#           ...
#                models
#                   {model-name}
#                   ...
#                       {devices}
#                          {device-1-serial}
#                          {device-2}
#                              {serial}-cert.pem
#                              {serial}-private-key.pem
#                              {serial}-public-key.pem
#
import re
import shutil
import stat
import os
import os.path
import json
import boto3
from botocore.exceptions import ClientError
import questionary
import keyring
import webbrowser
import traceback
from pathlib import Path
from questionary import Validator, ValidationError, prompt
from datetime import datetime

SIMPLEIOT_LOCAL_ROOT = "~/.simpleiot"
DEFAULT_TEAM = "simpleiot"

# Under this SSM manager parameter, we keep a copy of all the installation settings
# for subsequent users.
SIMPLEIOT_INSTALL_CONFIG = "/simpleiot/install/config"

# This is used by the installer when the first IOT monitor and settings are created
# by the singleton lambda.
# We use the data download the encrypted certs for accessing the IOT monitor.
#
SIMPLEIOT_IOT_INSTALLDATA = "/simpleiot/iot/installdata"

IOT_ROOTCA_NAME = "ca_pem_name"
IOT_PUBLIC_KEY_NAME = "public_key_name"
IOT_PRIVATE_KEY_NAME = "private_key_name"
IOT_CERT_KEY_NAME = "cert_pem_name"


# This just makes sure the directory structure is set up properly, and has proper access
# privileges. The 'sync' mechanism re-creates all the certs with the devices and models.
#
# NOTE also that the serial numbers MUST be normalized so they can be supported by the
# local filesystem.
#
# NOTE: if the user has specified a different project root, we still look for it in the
# config.json file in ~/.iot.
#

def _normalize_path_name(src):
    """
    Normalize a path name by removing all characters that aren't in a sanitized set.
    :param src: source name
    :return: cleaned path name
    """
    clean = re.sub('[^a-zA-Z0-9_-]', '', src)
    return clean


#
# This checks to see if the ~/.simpleiot directory exists or not. If not, it creates it so the
# docker mapping to the directory works.
#
def create_settings_if_not_exist(create=True):
    abs_path = os.path.expanduser(SIMPLEIOT_LOCAL_ROOT)
    if not os.path.exists(abs_path):
        if create:
            os.mkdir(abs_path)

    return abs_path


def get_iot_team_dir(team=DEFAULT_TEAM, create=True):
    """
    At the root of the IOT directory, we create directories for each
    given team. Inside each one will be the subdirectories for projects,
    models, etc. The team name will be 'normalized' by taking out
    invalid characters.

    Note that this may cause collisions if someone creates team names
    that differ only with invalid characters, for example ABC$ and ABC!
    will both be normalized to ABC.

    :param team: name of team.
    :param create: If set to true, creates the directory path if it doesn't exist
    :return:
    """
    result = None

    try:
        root_iot_dir = create_settings_if_not_exist(create)
        normal_team = _normalize_path_name(team)
        team_dir = os.path.join(root_iot_dir, normal_team)
        if not os.path.exists(team_dir):
            if create:
                os.makedirs(team_dir)

        result = team_dir
    except Exception as e:
        print("ERROR creating IOT root directory: " + str(e))

    return result


def get_iot_project_dir(team, project, create=True):
    """
    This returns the root of a single project directory.

    :param team: Team name
    :param project: Project name
    :param create: If set to true, creates the directory path if it doesn't exist
    :return:
    """
    result = None
    team_root = get_iot_team_dir(team, create)
    if team_root:
        normal_project = _normalize_path_name(project)
        project_dir = os.path.join(team_root, "projects", normal_project)
        if create:
            if not os.path.exists(project_dir):
                os.makedirs(project_dir)

        result = project_dir
    return result


def get_iot_model_dir(team, project, model, create=True):
    """
    This returns the root directory where model information is saved.

    :param team: Team name
    :param project: Project name
    :param model: Model name
    :param create: If set to true, creates the directory path if it doesn't exist
    :return:
    """
    result = None
    project_dir = get_iot_project_dir(team, project, create)
    if project_dir:
        normal_model = _normalize_path_name(model)
        model_dir = os.path.join(project_dir, "models", normal_model)
        if create:
            if not os.path.exists(model_dir):
                os.makedirs(model_dir)

        result = model_dir
    return result


def get_iot_device_dir(team, project, model, device, create=True):
    """
    This returns the root directory where individual device information is saved.

    :param team: Team name
    :param project: Project name
    :param model: Model name
    :param device: Device serial ID
    :param create: If set to true, creates the directory path if it doesn't exist
    :return:
    """
    result = None
    model_dir = get_iot_model_dir(team, project, model, create)
    if model_dir:
        normal_device = _normalize_path_name(device)
        device_dir = os.path.join(model_dir, "devices", normal_device)
        if create:
            if not os.path.exists(device_dir):
                os.makedirs(device_dir)

        result = device_dir
    return result


def delete_even_readonly_files(action, name, exc):
    """
    Utility to force a file to writeable and then remove it.
    This is passed as a shutil.rmtree error handler to clean up a file
    before deletion.

    :param action:
    :param name:
    :param exc:
    :return:
    """
    try:
        os.chmod(name, stat.S_IWRITE)
        os.remove(name)
    except Exception:
        pass


def delete_iot_device_dir(team, project, model, device):
    """
    Delete all the on-disk cache data having to do with a single Device.

    :param team:
    :param project:
    :param model:
    :param device:
    :return:
    """
    device_dir = get_iot_device_dir(team, project, model, device, create=False)
    #print(f"GOT device directory: {device_dir}")
    if device_dir:
        shutil.rmtree(device_dir, onerror=delete_even_readonly_files)


def delete_iot_model_dir(team, project, model):
    """
    Delete all the on-disk cache data having to do with a single Model.

    :param team:
    :param project:
    :param model:
    :return:
    """
    model_dir = get_iot_model_dir(team, project, model, create=False)
    if model_dir:
        shutil.rmtree(model_dir, onerror=delete_even_readonly_files)


def delete_iot_project_dir(team, project):
    """
    Delete all the on-disk cache data having to do with a single Project.

    :param team:
    :param project:
    :return:
    """
    project_dir = get_iot_project_dir(team, project, create=False)
    if project_dir:
        shutil.rmtree(project_dir, onerror=delete_even_readonly_files)


def delete_iot_team_dir(team):
    """
    Delete all the on-disk cache data having to do with a single Team.

    :param team:
    :return:
    """
    team_dir = get_iot_team_dir(team, create=False)
    if team_dir:
        shutil.rmtree(team_dir, onerror=delete_even_readonly_files)


# Due to security audit feedback, we do not include lambda layers sources
# in the source. Instead, we use a Docker image to generate one dynamically during
# bootstrap. This is left in the "iotcdk/lib/lambda_src/layers/iot_import_layer"
# directory under the "out" subdirectory. This path is then handed off the the lambda
# layer creation part of the CDK.
#
# During cleaning, we want to get rid of that directory so the system can be returned
# to its original pre-bootstrap state. This function finds that directory, and if present,
# removes it.
#
# Note that since this is being run inside the invoke script, the starting directory is
# the SimpleIOT/sources/iotapi folder
#
def delete_generated_lambda_layers():
    lambda_layer_folder = "iotcdk/lib/lambda_src/layers/iot_import_layer/out"
    if os.path.exists(lambda_layer_folder):
        shutil.rmtree(lambda_layer_folder, onerror=delete_even_readonly_files)

#################################
# Configuration loading routines
#
# These are used to centrally load config files for each Team
#
def path_for_bootstrap_file(team=DEFAULT_TEAM):
    team_path = get_iot_team_dir(team)
    bootstrap_path = os.path.join(team_path, "bootstrap.json")
    return bootstrap_path


def path_for_cdkoutput_file(team=DEFAULT_TEAM):
    team_path = get_iot_team_dir(team)
    cdkoutput_path = os.path.join(team_path, "cdkoutput.json")
    return cdkoutput_path

# A config file is a merged JSON file that combines boothstrap and cdkoutput
# data.

def path_for_config_file(team=DEFAULT_TEAM):
    team_path = get_iot_team_dir(team)
    config_path = os.path.join(team_path, "config.json")
    return config_path


def path_for_certs(team=DEFAULT_TEAM):
    team_path = get_iot_team_dir(team)
    certs_path = os.path.join(team_path, "certs")
    if not os.path.exists(certs_path):
        os.makedirs(certs_path)
    result = certs_path
    return result


def load_bootstrap_config(team=DEFAULT_TEAM):
    config_data = None
    bootstrap_path = None
    try:
        bootstrap_path = path_for_bootstrap_file(team)

        with open(bootstrap_path, "r") as infile:
            config_data = json.load(infile)
    except Exception as e:
        print(f"Could not load bootstrap config file for team: [{team}].\nPlease run 'invoke bootstrap' again.")
        exit(1)

    return config_data


def load_defaults_config(defaults_path):
    config_data = None
    try:
        with open(defaults_path, "r") as infile:
            config_data = json.load(infile)
    except Exception as e:
        print(f"ERROR loading defaults config file: [{defaults_path}]: {str(e)}")
        exit(1)

    return config_data


def load_cdkoutput_config(team=DEFAULT_TEAM):
    config_data = None
    cdkoutput_path = None
    try:
        cdkoutput_path = path_for_cdkoutput_file(team)

        with open(cdkoutput_path, "r") as infile:
            config_root = json.load(infile)
            config_data = config_root.get("Iotcdk", None)
    except Exception as e:
        print(f"ERROR loading CDK output config file: [{cdkoutput_path}]: {str(e)}")
        exit(1)

    return config_data

#
# We try to load the combined config file. If it doesn't exist, it means
# we're looking for it before it has been created (which means we're
# running somewhere between the bootstrap phase and the deploy phase.
# In this case, we just return the contents of the bootstrap file,
# since that's all we have.
#
def load_config(team=DEFAULT_TEAM):
    config_data = None
    config_path = None
    try:
        config_path = path_for_config_file(team)
        if Path(config_path).exists():
            with open(config_path, "r") as infile:
                config_data = json.load(infile)
        else:
            config_data = load_bootstrap_config(team)
    except Exception as e:
        print(f"ERROR: could not locate configuration data for project [{team}].")
        exit(1)

    return config_data


def save_bootstrap_config(json_data, team=DEFAULT_TEAM):
    bootstrap_file = None
    try:
        bootstrap_file = path_for_bootstrap_file(team)
        with open(bootstrap_file, 'w') as outfile:
                json.dump(json_data, outfile, indent=4)
    except Exception as e:
        print(f"ERROR saving {bootstrap_file}: {str(e)}")
        exit(1)

# This creates a merged copy of the bootstrap and the cdk output files in the
# .simpleiot directory.
#
# After each installation, we combine these files into a single config JSON
# file that can be loaded by all subsequent subsystems.
#
def create_merged_config(defaults_path, team=DEFAULT_TEAM, extras={}):
    config_path = None
    try:
        defaults_data = load_defaults_config(defaults_path)
        bootstrap_data = load_bootstrap_config(team)
        cdkoutput_data = load_cdkoutput_config(team)

        if bootstrap_data and defaults_data and cdkoutput_data:
            config_path = path_for_config_file(team)
            config_data = {**bootstrap_data, **defaults_data, **cdkoutput_data, **extras}

            # We synthesize the API endpoint returned by APIGateway with the
            # version suffix so it can handle API versioning. This is the actual
            # API endpoint the front-end should be using.
            #
            api_version_suffix = defaults_data.get("api_version_suffix", "v1")
            raw_api_endpoint = cdkoutput_data.get("apiEndpoint", None)
            if raw_api_endpoint:
                config_data["web_endpoint"] = f"{raw_api_endpoint}{api_version_suffix}"

            config_data["install_utc_time"] = datetime.utcnow().replace(microsecond=0).isoformat()

            config_data_str = json.dumps(config_data, indent=4)
            with open(config_path, 'w') as configfile:
                configfile.write(config_data_str)

            # THIS IS UNDER ACTIVE DEVELOPMENT AND MAY CHANGE.
            #
            # IN THE FIRST DRAFT, WE KEPT A COPY OF THE CONFIG FILE IN SSM SO IT COULD
            # BE RETRIEVED LATER. IN THE NEXT PASS, THE MINIMAL CONFIG DATA IS SENT TO
            # TO NEW TEAM INVITES SO THEY DON'T NEED TO BE EXPOSED TO FULL INSTALL RECORDS.
            # IN THIRD PASS, DATABASE ACCESS DATA HAS BEEN MOVED TO SECRETSMANAGER SO NO
            # LONGER NEEDED TO BE AVAILABLE TO USERS. ALSO, IOT_ENDPOINT IS NOW SAVED
            # SEPARATELY AND ACCESSED BY LAMBDAS AT RUNTIME, SO NO NEED TO ACCESS IT DIRECTLY
            # UNLESS USING THIRD-PARTY MQTT MONITORING TOOLS.
            #
            # NOTE: we also write the config data to a pre-defined key in the parameter
            # store for this account. This can be used by later users of the service
            # to configure their settings and run the CLI on their machine.
            # NOTE that maximum parameter size is 4K. As of this writing, most configs
            # clock-in at around 2K, so we have extra headroom, but if it gets too
            # large, you could remove the 'indent' statement above to save a few bytes
            # or try to send it through compression.
            #
            # aws_profile = bootstrap_data['aws_profile']
            # boto3.setup_default_session(profile_name=aws_profile)
            # ssm = boto3.client('ssm')
            # ssm.put_parameter(Name=SIMPLEIOT_INSTALL_CONFIG,
            #                   Description="SimpleIOT Install Config",
            #                   Value=config_data_str,
            #                   Type='SecureString',
            #                   Tier='Intelligent-Tiering',
            #                   Overwrite=True)
        else:
            print("WARNING: bootstrap, defaults, or CDK output data is empty.")

        return config_path

    except Exception as e:
        print(f"SEVERE ERROR: creating merged config data and secure store: [{config_path}]: {str(e)}")
        print(f"Please clean the project, fix the problems, and re-run the install.")
        exit(1)


def get_ssm_param(ssm, key):
    value = None
    try:
        data = ssm.get_parameter(Name=key, WithDecryption=True)
        if data:
            value = data["Parameter"]["Value"]
    except Exception as e:
        pass
    return value

#
# This routine writes the installation config data and makes a local copy in the cache
# config directory for this Team. Note that it overwrites any existing config.json
# files so use with caution. The data is assumed to have been sent down from the
# API. This lets the cloud prune out fields not needed by individual installs.
#
def save_to_local_config(config_data, team=DEFAULT_TEAM):
    try:
        if config_data:
            config_path = path_for_config_file(team)
            with open(config_path, 'w') as configfile:
                configfile.write(config_data)
    except Exception as e:
        print(f"ERROR: Could not save local copy of installation config data: {str(e)}")
        raise e

#
# This routine assumes that IOT certificate data has been saved on the cloud in pre-defined
# keys in the SSM parameter store. This routine makes a copy of those in the local certs
# directory. The endpoint is returned so it can be added to the config.json file.
#

def save_iot_certs_to_local_files(team, config):
    try:
        iot_monitor_rootca_filename = config.get("iot_monitor_rootca_filename", None)
        iot_monitor_cert_filename = config.get("iot_monitor_cert_filename", None)
        iot_monitor_public_key_filename = config.get("iot_monitor_public_key_filename", None)
        iot_monitor_private_key_filename = config.get("iot_monitor_private_key_filename", None)

        if not (iot_monitor_rootca_filename and iot_monitor_cert_filename and
                iot_monitor_public_key_filename and iot_monitor_private_key_filename):
            return

        aws_profile = config['aws_profile']
        boto3.setup_default_session(profile_name=aws_profile)
        ssm = boto3.client('ssm')

        iot_install_data_str = get_ssm_param(ssm, SIMPLEIOT_IOT_INSTALLDATA)
        if iot_install_data_str:
            iot_install_data = json.loads(iot_install_data_str)
            iot_monitor_rootca_name = iot_install_data.get(IOT_ROOTCA_NAME, None)
            iot_monitor_cert_key_name = iot_install_data.get(IOT_CERT_KEY_NAME, None)
            iot_monitor_private_key_name = iot_install_data.get(IOT_PRIVATE_KEY_NAME, None)
            iot_monitor_public_key_name = iot_install_data.get(IOT_PUBLIC_KEY_NAME, None)

            ca_data_str = get_ssm_param(ssm, iot_monitor_rootca_name)
            cert_data_str = get_ssm_param(ssm, iot_monitor_cert_key_name)
            public_key_data_str = get_ssm_param(ssm, iot_monitor_public_key_name)
            private_key_data_str = get_ssm_param(ssm, iot_monitor_private_key_name)
            cert_path = path_for_certs(team)
            ca_file_path = os.path.join(cert_path, iot_monitor_rootca_filename)
            cert_file_path = os.path.join(cert_path, iot_monitor_cert_filename)
            public_key_file_path = os.path.join(cert_path, iot_monitor_public_key_filename)
            private_key_file_path = os.path.join(cert_path, iot_monitor_private_key_filename)

            if not os.path.isfile(ca_file_path):
                with open(ca_file_path, 'w') as cafile:
                    cafile.write(ca_data_str)

            if not os.path.isfile(cert_file_path):
                with open(cert_file_path, 'w') as certfile:
                    certfile.write(cert_data_str)

            if not os.path.isfile(public_key_file_path):
                with open(public_key_file_path, 'w') as publickeyfile:
                    publickeyfile.write(public_key_data_str)

            if not os.path.isfile(private_key_file_path):
                with open(private_key_file_path, 'w') as privatekeyfile:
                    privatekeyfile.write(private_key_data_str)

            # We return the path to the certs and the iot endpoint so it can be merged into the config.json file
            #
            iot_endpoint = iot_install_data.get("iot_endpoint", None)
            return cert_path, iot_endpoint
        else:
            print(f"SEVERE ERROR: No IOT installation data found in SSM for key: {SIMPLEIOT_IOT_INSTALLDATA}")
            return None, None

    except Exception as e:
        print(f"ERROR: could not get a copy of IOT certificates to local cache: {str(e)}")
        print(traceback.print_exc())
        raise e

####################################################################################
# Temp files - these are used to pass data between various phases of installation.
# We save them in the local ~/.simpleiot directory during install and get rid of them
# after the install phase is done. It's important that this file be somewhere in a
# shared volume in the docker version so it can be accessed after each phase of the
# installation.
#
def save_to_tempfile(filename, data):
    try:
        settings_path = create_settings_if_not_exist()
        outfile = os.path.join(settings_path, filename)
        with open(outfile, 'w') as out:
            out.write(data + '\n')
    except Exception as e:
        print(f"ERROR: could not save data to tempfile: {str(e)}")
        raise e


def load_from_tempfile(filename):
    try:
        settings_path = create_settings_if_not_exist()
        infile = os.path.join(settings_path, filename)
        if os.path.exists(infile):
            with open(infile, 'r') as out:
                result = out.read().replace('\n','')
                return infile, result
        else:
            return infile, None
    except Exception as e:
        print(f"ERROR: could not read data from tempfile {filename}")
        raise e


def load_from_tempfile_and_delete(filename):
    try:
        infile, result = load_from_tempfile(filename)
        os.remove(infile)
        return infile, result
    except Exception as e:
        print(f"ERROR: could not read data from tempfile {filename} and delete")
        raise e


#######

def ask_to_confirm_delete():
    is_delete = questionary.text("\nAre you sure you want to do this. Enter 'DELETE' to confirm:").ask()
    if is_delete == 'DELETE':
        return True
    else:
        return False

#########

#
# Username/password/API token/SSO session management
#
# NOTE: a service name is synthesized with the team name. If not specified
# in the config file, we use default. This way we can store tokens and passwords
# for multiple teams.
#
def _get_service(config):
    team = config.team
    if not team:
        team = DEFAULT_TEAM

    service = f"simpleiot_{team}"
    return service

def get_stored_key(config, key):
    service = _get_service(config)
    value = keyring.get_password(service, key)
    return value

def set_stored_key(config, key, value):
    service = _get_service(config)
    keyring.set_password(service, key, value)

def get_stored_username(config):
    return get_stored_key(config, "username")

def get_stored_password(config):
    return get_stored_key(config, "password")

def get_stored_api_token(config):
    return get_stored_key(config, "api_token")

def get_stored_access_key(config):
    return get_stored_key(config, "access_key")

def get_stored_access_secret(config):
    return get_stored_key(config, "access_secret")

def get_stored_session_token(config):
    return get_stored_key(config, "session_token")

def store_username(config, username):
    set_stored_key(config, "username", username)

def store_password(config, password):
    set_stored_key(config, "password", password)

def store_api_token(config, token):
    set_stored_key(config, "api_token", token)

def store_access_key(config, key):
    set_stored_key(config, "access_key", key)

def store_access_secret(config, secret):
    set_stored_key(config, "access_secret", secret)

def store_session_token(config, token):
    set_stored_key(config, "session_token", token)

def clear_api_token(config):
    try:
        service = _get_service(config)
        keyring.delete_password(service, "api_token")
    except Exception as e:
        pass

def clear_sso_tokens(config):
    try:
        service = _get_service(config)
        keyring.delete_password(service, "access_key")
        keyring.delete_password(service, "access_secret")
        keyring.delete_password(service, "session_token")
    except Exception as e:
        pass

def clear_all_auth(config):
    try:
        service = _get_service(config)
        keyring.delete_password(service, "username")
        keyring.delete_password(service, "password")
        keyring.delete_password(service, "api_token")
        keyring.delete_password(service, "access_key")
        keyring.delete_password(service, "access_secret")
        keyring.delete_password(service, "session_token")
    except Exception as e:
        pass

################
# SSO Login

class IsEmptyValidator(Validator):
    def validate(self, document):
        if len(document.text) == 0:
            raise ValidationError(
                message="Please enter a value",
                cursor_position=len(document.text),
            )


#
# This function tries to login using SSO credentials. If SSO credentials were saved from the last time
# they're used here. If not, we ask for them.
#
def login_with_sso(config):
    try:
        GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
        sso_url_stored = config.get("sso_url", "")
        url_ok = False
        import validators

        while not url_ok:
            sso_url = questionary.text("AWS SSO url?", validate=IsEmptyValidator, default=sso_url_stored).ask()
            url_ok = validators.url(sso_url)
            if not url_ok:
                print("ERROR: Invalid URL")

        sso_region_stored = config.get("region", None)
        session = boto3.session.Session()
        regions = session.get_available_regions('sso-oidc')
        if len(regions) == 0:
            print("ERROR: SSO not supported in these regions")
            exit(1)

        if not sso_region_stored:
            sso_region_stored = regions[0]

        sso_region = questionary.select("AWS SSO region: ", choices=regions, default=sso_region_stored).ask()

        sso_oidc = boto3.client('sso-oidc', region_name=sso_region)
        try:
            resp = sso_oidc.register_client(clientName="simpleiot", clientType="public")
            client_id = resp['clientId']
            client_secret = resp['clientSecret']

            resp = sso_oidc.start_device_authorization(
                clientId=client_id, clientSecret=client_secret, startUrl=sso_url)
            device_code = resp['deviceCode']
            signin_url = resp['verificationUriComplete']
            webbrowser.open(signin_url)

            access_token = False

            while not access_token:
                try:
                    resp = sso_oidc.create_token(clientId=client_id, clientSecret=client_secret,
                                                 grantType=GRANT_TYPE, deviceCode=device_code)
                    access_token = resp['accessToken']
                except sso_oidc.exceptions.AuthorizationPendingException:
                    continue
                except Exception as e:
                    print(f"ERROR: CREATE SSO TOKEN EXCEPTION: {str(e)}")
                    exit(1)

            sso = boto3.client('sso', region_name=sso_region)

            resp = sso.list_accounts(maxResults=1000, accessToken=access_token)
            account_array = resp['accountList']
            account_id = None
            account_name= None
            account_role = None

            if len(account_array) == 0:
                print("ERROR: No valid SSO accounts found")
                exit(1)

            # If we only have one account, we don't bother asking
            #
            if len(account_array) == 1:
                account = account_array[0]
                account_id = account['accountId']
                account_name = account['accountName']
            else:
                account_list = {}
                account_names = {}
                for account in account_array:
                    _name = account['accountName']
                    _email = account['emailAddress']
                    _id = account['accountId']
                    account_list[f"{_name} ({_email})"] = _id
                    account_names[_id] = _name

                account_names = list(account_list.keys())
                account_choice = questionary.select("Select SSO Account: ", choices=account_names).ask()
                account_id = account_list[account_choice]
                account_name = account_names[account_id]

            resp = sso.list_account_roles(maxResults=1000,
                                          accessToken=access_token,
                                          accountId=account_id)
            role_array = resp['roleList']
            if len(role_array) == 0:
                print("ERROR: no roles found for account. Please correct and re-run")
                exit(1)

            if len(role_array) == 1:
                account_role = role_array[0]['roleName']
            else:
                role_list = []
                for role in role_array:
                    role_list.append(role['roleName'])

                account_role = questionary.select("Select SSO Account Role: ", choices=role_list).ask()

            resp = sso.get_role_credentials(roleName=account_role, accountId=account_id,
                                            accessToken=access_token)
            access_key = resp['roleCredentials']['accessKeyId']
            access_secret = resp['roleCredentials']['secretAccessKey']
            session_token = resp['roleCredentials']['sessionToken']

            return sso_url, \
                   sso_region, \
                   account_id, \
                   account_role, \
                   account_name, \
                   access_key, \
                   access_secret, \
                   session_token

        except sso_oidc.exceptions.InvalidRequestException:
            print("ERROR: Invalid Request to SSO")
            exit(1)
        except sso_oidc.exceptions.TooManyRequestsException:
            print("ERROR: Too many requests Exception")
            exit(1)
        except sso_oidc.exceptions.UnauthorizedException:
            print("ERROR: Unauthorized Exception")
            exit(1)
        except sso_oidc.exceptions.ResourceNotFoundException:
            print("ERROR: Resource Not Found Exception")
            exit(1)
        except Exception as e:
            print(f"ERROR: {str(e)}")
            traceback.print_exc()
            return None

    except Exception as e:
        print(f"ERROR: {str(e)}")
        traceback.print_exc()
        return None

##############################################################################
# This allows looking up a string from elements of an Enum.
# Used to lookup device model fields. The lookup is case-insensitive.
#
def enum_from_str(en, nm):
    try:
        for item in en:
            if nm.lower() == item.name.lower():
                return item.value

        raise ValueError(f"Invalid value specified for enum {str(en)}")
    except Exception as e:
        print(f"Error: {e}")
        return None

#
# This reverses the above and returns the string value of an enum.
# Used to display or export an enum into a config file.
#
def enum_to_str(en, item):
    result = None
    try:
        result = en(item).name.lower()
    except Exception as e:
        pass

    return result

# This does the above, except it looks for a list of string values,
# which it then turns into an ORed bitflag.
#
# The values are assumed to be comma-separated and each a valid item in the
# enum. We don't check for duplicates.
#
def enum_from_str_list(en, nml):
    flag = 0
    slist = nml.split(",")
    try:
        for st in slist:
            for item in en:
                if st.strip().lower() == item.name.lower():
                    flag |= int(item.value)
                    break
        return flag
    except Exception as e:
        print(f"Error: {e}")
        return None

#
# This does the reverse, except it returns a list of enums.
#
def enum_to_str_list(en, value):
    result = []
    try:
        for b in range(1, len(en) + 1):
            cb = b - 1
            item = en(1 << cb)
            if (value & (1 << (b - 1))):
                result.append(item.name)
        return ", ".join(result)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        pass
    return result

#
# This is used to get a secret out of secretsmanager.
#
def get_secret(config, name):
    profile = config.get("aws_profile", "default")
    os.environ['AWS_PROFILE'] = profile
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=config.get("region", None)
    )

    # In this sample we only handle the specific exceptions for the 'GetSecretValue' API.
    # See https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
    # We rethrow the exception by default.

    try:
        secret_value = client.get_secret_value(
            SecretId=name
        )
    except ClientError as e:
        print(f"Got exception: {str(e)}")

        if e.response['Error']['Code'] == 'DecryptionFailureException':
            # Secrets Manager can't decrypt the protected secret text using the provided KMS key.
            # Deal with the exception here, and/or rethrow at your discretion.
            raise e
        elif e.response['Error']['Code'] == 'InternalServiceErrorException':
            # An error occurred on the server side.
            # Deal with the exception here, and/or rethrow at your discretion.
            raise e
        elif e.response['Error']['Code'] == 'InvalidParameterException':
            # You provided an invalid value for a parameter.
            # Deal with the exception here, and/or rethrow at your discretion.
            raise e
        elif e.response['Error']['Code'] == 'InvalidRequestException':
            # You provided a parameter value that is not valid for the current state of the resource.
            # Deal with the exception here, and/or rethrow at your discretion.
            raise e
        elif e.response['Error']['Code'] == 'ResourceNotFoundException':
            # We can't find the resource that you asked for.
            # Deal with the exception here, and/or rethrow at your discretion.
            raise e
    else:
        # Decrypts secret using the associated KMS CMK.
        # Depending on whether the secret is a string or binary, one of these fields will be populated.
        if 'SecretString' in secret_value:
            secret = secret_value["SecretString"]
            return json.loads(secret)
        else:
            return None