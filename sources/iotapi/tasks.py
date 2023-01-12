# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#

from invoke import task, Collection
from invoke.tasks import call
from invoke.executor import Executor

import json
import os
import requests
from urllib.parse import urlparse
from rich import print
from rich.color import Color
from rich.console import Console, ConsoleOptions, RenderGroup, RenderResult
from rich.segment import Segment
from rich.style import Style
from rich.table import Table

from util.config import *
from iotcdk.installer.params import *
from iotcdk.installer.askconfig import *
from timeit import default_timer as timer
from datetime import timedelta
import traceback


# NOTE NOTE NOTE - If adding more Invoke tasks and they need to daisy-chain to
# each other, make sure it's added to the list all the way at the bottom.
#

BUILD_DIR = "build"
LICENSE_DIR = "license"
DEFAULTS_CONFIG_PATH = os.path.abspath(os.path.join("iotcdk", "installer", "defaults.json"))

#
# This should ordinarily be false, so if installation fails, CDK tries to clean up the stack.
# But if something breaks badly and you need to go inspect the stack, set this to True.
# It will add a --no-rollback flag to cdk deploy so the stacks are kept in place and you can
# go look at the logs and resources to help debug problems.
#
# If so, you are responsible for deleting the stacks.
#
PREVENT_ROLLBACK_ON_FAIL_FOR_DEBUGGING = True

#
# If False, we use a single RDS/Aurora instance. If True, we create an Aurora serverless cluster.
# Check in cdk_database.ts and iotcdk-stack.ts for details.
#
DATABASE_USE_AURORA = False


def load_defaults():
    config = None
    try:
        config = load_defaults_config(DEFAULTS_CONFIG_PATH)
    except Exception as e:
        pass
    return config


class ColorLine:
    def __rich_console__(
        self, console: Console, options: ConsoleOptions
    ) -> RenderResult:
        for y in range(0, 1):
            for x in range(30):
                color = Color.from_rgb(255, 165, 0)
                yield Segment("■", Style(color=color,))
            yield Segment.line()

def header(c):
    console = Console(
        force_terminal=True,
    )
    color_table = Table(
        box=None,
        expand=False,
        show_header=False,
        show_edge=False,
        pad_edge=False,
    )
    color_table.add_row(ColorLine())
    color_table.add_row("  WELCOME TO SimpleIOT ")
    color_table.add_row("        INSTALLER ")
    color_table.add_row(ColorLine())
    console.print(color_table)

#
# NOTE: if they signed in with SSO, the 'team' name returned will be a normalized
# form of the Team Name.
#
def pre_install(c, team=None):
    header(c)
    defaults = load_defaults()

    try:
        result = get_config_data(team)
        if not result:
            print("Exiting...")
            exit(0)

    # if team:
    #     cmd = f"cd iotcdk/installer; python3 askconfig.py {team}"
    # else:
    #     cmd = f"cd iotcdk/installer; python3 askconfig.py"
    #
    # result = c.run(cmd, pty=True, warn=True)
    # if result.exited == 0:  # if it worked, we load the bootstrap config and use it to start the next phase
        if not team:
            team_file_name = defaults.get("saved_team_file_name")
            _, team = load_from_tempfile(team_file_name)

        config = load_bootstrap_config(team)
        if config.get('db_bastion', None):
            #
            # NOTE: if they've asked for a bastion, if we came in through SSO, the
            # access_key/secret_id/session_token values are stored in the keychain and need to be provided
            # there, otherwise, we'll use the profile name.
            #
            bastion_keypair_name = defaults.get("bastion_ssh_ec2_keypair_name")
            bastion_keypair_filename = defaults.get("bastion_ssh_ec2_keypair_filename")
            certs_path = path_for_certs(team)
            aws_profile = config.get('aws_profile', "default")
            bastion_keypair_path = os.path.abspath(os.path.join(certs_path, bastion_keypair_filename))

            # We go delete the old keypair, if it was there from a previous install. We ignore the
            # result.

            delete_cmd = f"cd iotcdk; \
                    export AWS_PROFILE=\"{aws_profile}\"; \
                    aws ec2 delete-key-pair --key-name {bastion_keypair_name};"
            c.run(delete_cmd, hide=True, warn=False)

            # Then we go create a new keypair for remote SSH access
            #
            create_cmd = f"cd iotcdk; \
                    export AWS_PROFILE=\"{aws_profile}\"; \
                    aws ec2 create-key-pair --key-name {bastion_keypair_name}"
            result = c.run(create_cmd, hide=True, warn=True)
            if result.exited == 0:
                key_output = result.stdout
                pem_json = json.loads(key_output)
                pem_body = pem_json['KeyMaterial']
                with open(bastion_keypair_path, 'w') as pem:
                    pem.write(pem_body)
                print("Done: Pre-check")
                return team
            else:
                print(f"ERROR: could not create keypair.\n\n{result.stderr}")
                return None
        else:
            print("Done: Pre-check")
    except KeyboardInterrupt:
        print(":worried_face: [bold red]Setup canceled.[/bold red] Sorry to see you go, but please, come again! :wave:")
        return None
    except Exception as e:
        print(f"ERROR getting configuration data: {str(e)}")
        exit(1)

#
# Gets the latest Postgres DB version
#
def get_db_version(c, team=None):
    engine_version = None
    engine_major = None
    global DATABASE_USE_AURORA

    try:
        bootstrap = load_bootstrap_config(team)
        if bootstrap:
            aws_profile = bootstrap.get("aws_profile", None)
            if DATABASE_USE_AURORA:
                engine_name = "aurora-postgresql"
            else:
                engine_name = "postgres"

            version_json = c.run(f"aws rds describe-db-engine-versions --engine {engine_name} "
                                 f"--output json --profile={aws_profile}",
                                 hide='both')
            if version_json.ok:
                version_list = json.loads(version_json.stdout)
                version_data = version_list["DBEngineVersions"]
                last_item = version_data[-1]
                engine_version = last_item["EngineVersion"]
                engine_major = last_item["MajorEngineVersion"]
        return engine_version, engine_major
    except Exception as e:
        print(f"ERROR getting database version: {str(e)}")
        exit(1)


#
# To bootstrap, we need to go ask some questions, then we run the CDK bootstrap script
# to create the Stack and S3 buckets it needs. This script can be run multiple times
# if needed. It saves the old values and reads them. But you can't really change things
# like account numbers and regions without things getting really messy downstream.
#
@task()
def bootstrap(c, team=None):
    result = pre_install(c, team)
    if result:
        defaults = load_defaults()
        team_file_name = defaults.get("saved_team_file_name")
        _, team = load_from_tempfile(team_file_name)

        if team:
            print(f"Running Bootstrap script for Team: {team}")
            team_path = get_iot_team_dir(team)
            config = load_bootstrap_config(team)
            aws_profile = config.get('aws_profile', 'default')
            aws_account = config.get('account', 'INVALID-ACCOUNT')
            region = config.get('region', 'INVALID-REGION')
            cdk_bootstrap = f"cdk bootstrap aws://{aws_account}/{region} --profile={aws_profile}"
            engine_version, engine_major = get_db_version(c, team)

            my_ip = get_my_ip()

            result = c.run(f"export IOT_DEFAULTS_FILE='{DEFAULTS_CONFIG_PATH}'; \
                    export IOT_TEAM_PATH='{team_path}'; \
                    export CDK_DEBUG=true; \
                    export MY_IP='{my_ip}'; \
                    export POSTGRES_FULL_VERSION='{engine_version}'; \
                    export POSTGRES_MAJOR_VERSION='{engine_major}'; \
                    export DATABASE_USE_AURORA='{DATABASE_USE_AURORA}'; \
                    {cdk_bootstrap}; \
                    if [ $? -eq 0 ]; then \
                      cd iotcdk; \
                      ./prebuild.sh; \
                      npm run build; \
                      cdk context --clear --profile {aws_profile}; \
                      cdk bootstrap --profile {aws_profile}; \
                    fi")
            if result.ok:
                print("Done: you can now proceed to the next step by running:")
                print(f"   invoke deploy --team {team}")
            else:
                print(f"ERROR: stopping. Please correct problem and run again.")
                exit(1)
        else:
            print("No Team defined!")

#
# Deployment is a multi-phase process. We first create all the back-end resources necessary to
# run the application with a CDK stack passing a 'phase' variable to it.
# This involves creating S3 buckets, IOT endpoints, lambdas, databases, etc.
# Then we run a script to download all the certs to local files. Then we run another
# script that takes the pre-sets, construct the config files needed by different
# subsystems, and copies them into the right directories. These include settings needed
# for the dashboard, the mobile apps, etc.
# Then we run an npm build phase to rebuild the dashboard with the proper settings.
# The final phase is to re-run the cdk stack with a phase2 variable, which deploys the
# dashboard into an S3 bucket and a cloudfront deployment. The result of that is saved
# to a separate setting file which can then be used to launch the dashboard.
#

# NOTE: if you run this and start getting Node or CDK errors, make sure you run
# 'invoke cdkupdate' to update the core CDK system, then follow the instructions
# here to make sure the dependencies are properly set up:
#
# https://docs.aws.amazon.com/cdk/latest/guide/troubleshooting.html
#
# NOTE: at this stage we require a team name to proceed.
#
@task()
def deploy(c, team=None):
    global PREVENT_ROLLBACK_ON_FAIL_FOR_DEBUGGING

    start_time = timer()
    iot_endpoint = None
    cert_path = None

    if PREVENT_ROLLBACK_ON_FAIL_FOR_DEBUGGING:
        rollback = "--no-rollback"
    else:
        rollback = ""

    defaults = load_defaults()
    if not team:
        team_file_name = defaults.get("saved_team_file_name")
        _, team = load_from_tempfile(team_file_name)
        if not team:
            print("Parameter 'team' has to be specified. Exiting.")
            exit(1)

    print(f"Deploying services on AWS with Team {team}")
    bootstrap = load_bootstrap_config(team)
    if bootstrap and defaults:

        aws_profile = bootstrap.get("aws_profile", None)
        account = bootstrap.get("account", None)
        stack_config = defaults.get("stack_prefix", None)
        if aws_profile and stack_config:
            output_conf = path_for_cdkoutput_file(team)
            team_path = get_iot_team_dir(team)
            my_ip = get_my_ip()
            engine_version, engine_major = get_db_version(c, team)

            #print(f"Outbound IP address: {my_ip}")

            result = c.run(f"export IOT_DEFAULTS_FILE='{DEFAULTS_CONFIG_PATH}'; \
                    export IOT_TEAM_PATH='{team_path}'; \
                    export MY_IP='{my_ip}'; \
                    export POSTGRES_FULL_VERSION='{engine_version}'; \
                    export POSTGRES_MAJOR_VERSION='{engine_major}'; \
                    export DATABASE_USE_AURORA='{DATABASE_USE_AURORA}'; \
                    cd iotcdk; \
                    npm run build; \
                    cdk deploy {stack_config} \
                        --profile {aws_profile} \
                        --require-approval never \
                        {rollback} \
                        --outputs-file {output_conf};", pty=True, warn=True)
            if result.exited == 0:
                # We also get a localized copy of the default IOT monitor things
                # to the local certs directory.
                #
                temp_config = {**defaults, **bootstrap}
                cert_path, iot_endpoint = save_iot_certs_to_local_files(team, temp_config)

                if not cert_path:
                    print(f"ERROR during install. No path to certificates found")
                    exit(1)

                extras = {}
                if iot_endpoint:
                    extras["iot_endpoint"] = iot_endpoint
                #
                # We merge the three config files (the defaults.json, the bootstrap.json
                # file in this installation, and the generated JSON file after running the CDK
                # into a single JSON file that is used by all subsystems.
                # We also add the iot_endpoint returned when creating the monitor device.
                # The following also writes the merged data up to the parameter store
                # so subsequent users can download the file and use them for their own
                # installations.
                # NOTE: we also add the iot_endpoint returned from the previous step so
                # the config.json file has access to it.
                #
                config_path = create_merged_config(DEFAULTS_CONFIG_PATH, team, extras)

                end_time = timer()
                elapsed_time = timedelta(seconds=end_time - start_time)
                print(f"Done: Install Success [duration: {elapsed_time}].\n"
                      f"Now initialize the database and preload settings with:")
                print(f"   invoke dbsetup --team {team}")
            else:
                print(f"ERROR: please fix problems then re-run")
                exit(0)

#
# Upload will load static media into buckets already created. Standard CDK deployment violates
# internal EE security rules, so we have to copy static files with the proper access rules
# from the command line
#
@task()
def upload(c, team):
    config = load_config(team)
    aws_profile = config.get('aws_profile', 'default')
    print(f"Uploading static template files for team: '{team}' with AWS Profile: '{aws_profile}'")
    dashboard_bucket = config.get('dashboardBucketName', None)
    if dashboard_bucket:
        result = c.run(f"cd iotcdk/static; \
                         aws s3 cp ./template_files s3://{dashboard_bucket} \
                         --recursive --acl public-read \
                         --profile {aws_profile} ", pty=True, warn=True)
        print(f"Copy Result: {result}")
        print(f"Invalidating CloudFront distribution")
        dashboard_distribution_id = config.get('dashboardCFDistributionId', None)
        result = c.run(f"cd iotcdk/static; \
                         aws cloudfront create-invalidation --distribution-id {dashboard_distribution_id}  \
                         --paths '/*' \
                         --profile {aws_profile} ", pty=True, warn=True)
        print(f"Invalidate Result: {result}")
        dashboard_domain_name = config.get('dashboardDomainName', None)
        if dashboard_domain_name:
            print(f"Done: template media accessible via https://{dashboard_domain_name}")
        else:
            print(f"ERROR: template bucket URL not found. Please fix deployment problems then re-run.")
            exit(1)
    else:
        print("ERROR: deployment problem. Could not find 'templateBucketName' in output.")
        exit(1)

@task()
def mergetest(c, team):
    config = create_merged_config(DEFAULTS_CONFIG_PATH, team)
    print(f"Created merged config at: {config}")
    cert_path = save_iot_certs_to_local_files(team)
    print(f"IOT certs saved in: {cert_path}")

#
# Perform apitest
#
@task()
def apitest(c, team):
    username = os.getenv("IOT_AUTH_USERNAME")
    password = os.getenv("IOT_AUTH_PASSWORD")
    if not username:
        print(f"ERROR: environment variable IOT_AUTH_USERNAME has to be set before running tests")
        exit(1)
    if not password:
        print(f"ERROR: environment variable IOT_AUTH_PASSWORD has to be set before running tests")
        exit(1)
    c.run(f"cd test; \
                 pytest", pty=True, warn=True)


#
# This is used to initialize the database. It erases all previous tables,
# creates the DB schema, and then runs the loader script that sets up
# initial values from the JSON database.
#
# BE VERY CAREFUL WHEN RUNNING THIS MORE THAN ONCE!
# IT WILL DESTROY YOUR EXISTING DATA IRREVERSIBLY.
# IT SHOULD ONLY BE USED IN DEVELOPMENT ENVIRONMENTS MORE THAN ONCE.
#

@task()
def dbsetup(c, team=None):
    defaults = load_defaults()
    if not team:
        team_file_name = defaults.get("saved_team_file_name")
        _, team = load_from_tempfile(team_file_name)
        if not team:
            print("Parameter 'team' has to be specified. Exiting.")
            exit(1)

    venv_path = "venv/bin/activate"
    print(f"Configuring Database Schema for Team: {team}")
    config = load_config(team)
    aws_profile = config.get('aws_profile', 'default')

    # Inside a docker container there is no venv. But if run from the host command line, we will need to
    # intitialize it first.
    #
    command = ""
    if os.path.exists(venv_path):
        command = "source venv/bin/activate; "
    command += f"cd ./db; python3 dbloader.py {team}"

    if config:
        result = c.run(command, pty=True, warn=True)

        if result.exited == 0:
            print("DONE: Database loaded. You should be able to login with the 'iot' CLI.")
            print("Run 'iot --help' for a list of available commands.")

            # Clean up the last install file name. Only if we have reached this stage.
            #
            defaults = load_defaults()
            team_file_name = defaults.get("saved_team_file_name")
            _, team = load_from_tempfile_and_delete(team_file_name)

    else:
        print(f"ERROR: Could not retrieve Team data for {team}")

#
# Install is a one-shot call to bootstrap, then deploy, then dbsetup then post-install cleanup.
#
@task(pre=[
        call(bootstrap),
        call(deploy),
        call(dbsetup)])
def install(c):
    print("Running install process")


#
# This updates the CDK to the latest version, then runs npm install to make sure all the
# dependencies have been updated.
#
# NOTE: we need to juggle cdk.out directories to attach the names.

@task()
def cdkupdate(c):
    print("Updating CDK to latest version")
    result = c.run(f" \
                cd iotcdk; \
                npm install --legacy-peer-deps -g aws-cdk@latest; \
                cdk --version; \
                npm update --legacy-peer-deps; \
                npx ncu -u; \
                npm install --legacy-peer-deps", pty=True, warn=True)
    print("Done: CDK Update")
#


#
# We can't update node using nvm since it's installed as a shell
# macro. Instead we display what has to be done via copy/paste
#
@task()
def nodeupdate(c):
    print("To update 'node' to latest version using 'nvm' copy/paste into shell:")
    print("  cd iotcdk");
    print("  nvm install node --reinstall-packages-from=node");
#

def cleanup_bootstrap_and_local_artifacts(c, team, aws_profile):
    # Now we delete the EC2 bastion keypair. The local copy will get zapped when the
    # entire profile directory is removed.
    #
    defaults = load_defaults()
    if defaults:
        bastion_keypair_name = defaults.get("bastion_ssh_ec2_keypair_name")
        print(f"Deleting SSH bastion EC2 keypair: {bastion_keypair_name}")
        cmd = f"cd iotcdk; \
                export AWS_PROFILE=\"{aws_profile}\"; \
                aws ec2 delete-key-pair --key-name {bastion_keypair_name}"
        c.run(cmd, hide=True, warn=True)
        print(f"Deleting saved admin password")
        param_name = f"/simpleiot/{team}/admin_password"
        delete_param(param_name, aws_profile)

        print(f"Cleaning team directory for team [{team}].")
        delete_iot_team_dir(team)

        print("Cleaning generated lambda layers.")
        delete_generated_lambda_layers()

        print("Done")
    else:
        print(f"Local settings for team [{team}] not found.")


#
# Certain organization rules add an SSM policy to IAM roles AFTER a stack has been created.
# This will prevent CDK to delete the stack when cleaning. For an example, see:
# https://github.com/aws/aws-cdk/issues/15024
#
# You can manually delete the added policy using the AWS CLI, but we use the boto3 SDK
# to do the same thing:
#
def clean_stray_ssm_policy_roles(aws_profile):
    try:
        import boto3
        session = boto3.Session(profile_name=aws_profile)
        client = session.client('iam')

        roles = []
        response = client.list_roles()
        roles.extend(response['Roles'])
        while 'Marker' in response.keys():
            response = client.list_roles(Marker=response['Marker'])
            roles.extend(response['Roles'])

        for role in roles:
            role_name = role['RoleName']
            if "dbbastionhostInstance" in role_name:
                client.detach_role_policy(RoleName=role_name,
                                          PolicyArn='arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore')
                print(f"Extra attached role policy deleted.")
                break
    except Exception as e:
        print("ERROR: could not remove extra policy from bastion IAM role.\n"
              "       This might prevent the stack from getting cleaned up properly.")
        print(e)
        exit(0)
#
# Clean up the installation. This invokes a CDK clean but also performs
# local cleanup tasks. If the stack was run BEFORE cdk deploy was finished
# then we don't have access to the CDK yet, so we only do local cleanup,
# and remove the few artifacts created during bootstrapping. These
# are currently the EC2 SSH keypair and the SSM password that was entered
# during bootstrap. For security, we don't save that to the local disk
# but instead place it inside SSM parameter as a secret key.
#
@task()
def clean(c, team):
    config = load_config(team)
    aws_profile = config.get("aws_profile", "default")
    print(f"Deleting stack and cleaning up for team: [{team}]")
    team_path = get_iot_team_dir(team)
    if team_path:
        confirm_delete = ask_to_confirm_delete()
        if not confirm_delete:
            print("Phew! That was close. Stopping.")
            exit(0)

        #
        # First let's see if a full CDK run completed. We do that if the config.json
        # file exists.
        #
        config_path = path_for_config_file(team)
        if Path(config_path).exists():
            my_ip = get_my_ip()
            print(f"Cleaning up the cloud stack for team: {team}")
            clean_stray_ssm_policy_roles(aws_profile)
            result = c.run(f"export IOT_DEFAULTS_FILE='{DEFAULTS_CONFIG_PATH}'; \
                        export IOT_TEAM_PATH='{team_path}'; \
                        export MY_IP='{my_ip}'; \
                        cd iotcdk; \
                        cdk destroy --force --profile {aws_profile}", pty=True, warn=True)
            if result.exited == 0:
                cleanup_bootstrap_and_local_artifacts(c, team, aws_profile)
                print("Done: Clean Success.")
            else:
                print(f"ERROR: Problem deleting stack. Please fix issue and run again.")
        else:
            #
            # Bootstrap was run, but deploy wasn't. This cleans up the artifacts left over.
            #
            print(f"Cleaning up bootstrap and local artifacts for team: {team}")
            cleanup_bootstrap_and_local_artifacts(c, team, aws_profile)
            print("Done: Clean Success.")
    else:
        print(f"ERROR: invalid Team: {team}")

#
# Internal: we use this to generate open-source license reports for compliance purposes.
# NOTE: it assumes NPM license-checker (for NPM) and pip-licenses is installed.
#
@task()
def checklicense(c):
    try:
        if not os.path.exists(LICENSE_DIR):
            os.makedirs(LICENSE_DIR)

        NPM_RAW_OUTPUT = os.path.join(LICENSE_DIR, "npm_license_check_raw.json")
        NPM_SUMMARY_OUTPUT = os.path.join(LICENSE_DIR, "npm_license_summary.json")
        PIP_RAW_OUTPUT = os.path.join(LICENSE_DIR, "python_license_check_raw.json")
        PIP_SUMMARY_OUTPUT = os.path.join(LICENSE_DIR, "python_license_summary.txt")


        print(f"NPM dependency check.\ncreated path: {NPM_SUMMARY_OUTPUT}\ncreated path: {NPM_RAW_OUTPUT}")
        c.run("cd iotcdk;"
              f"npx license-checker --json --relativeLicensePath > ../{NPM_RAW_OUTPUT};")

        npm_license_data = {}

        if os.path.exists(NPM_RAW_OUTPUT):
            with open(NPM_RAW_OUTPUT) as npm_license_file:
                npm_json_data = json.load(npm_license_file)

            for item in npm_json_data.keys():
                items = npm_json_data[item]
                full_path = items["path"]
                clean_path = "." + full_path.partition("iotapi")[2]
                items["path"] = clean_path
                license = items["licenses"]
                license_file_path = items.get("licenseFile", None)
                if not license_file_path:
                    full_license_path = None
                else:
                    full_license_path = os.path.join("iotcdk", license_file_path)
                if full_license_path and os.path.exists(full_license_path):
                    with open(full_license_path, 'r') as license_file:
                        license_text = license_file.read()
                        if license_text:
                            items["licenseText"] = license_text
                else:
                    name = item.split("@")[1]
                    license_file, license_text = fetch_missing_license(name)
                    print(f"Wrote missing local license file to: {license_file}")
                    if license_text:
                        npm_json_data[item]["licenseText"] = license_text
                    if license_file:
                        npm_json_data[item]["licenseFile"] = license_file

                if license not in npm_license_data:
                    npm_license_data[license] = [item]
                else:
                    npm_license_data[license].append(item)

            with open(NPM_RAW_OUTPUT, 'w') as npm_license_out_file:
                npm_license_out_file.write(json.dumps(npm_json_data, indent=2))

            with open(NPM_SUMMARY_OUTPUT, 'w') as npm_license_summary_file:
                npm_license_summary_file.write(json.dumps(npm_license_data, indent=2))

        print(f"\nPython dependency check.")
        c.run("source venv/bin/activate;"
              "pip-licenses --format=json --with-authors "
              "--with-urls --with-description --with-license-file "
              f"--output-file={PIP_RAW_OUTPUT};"
              f"pip-licenses --summary --output-file={PIP_SUMMARY_OUTPUT};"
              )
        if os.path.exists(PIP_RAW_OUTPUT):
            with open(PIP_RAW_OUTPUT) as pip_license_file:
                python_json_data = json.load(pip_license_file)

            for item in python_json_data:
                full_path = item["LicenseFile"]
                if full_path == "." or full_path == "UNKNOWN":
                    name = item["Name"]
                    license_file, license_text = fetch_missing_license(name)
                    print(f"Wrote missing local license file to: {license_file}")
                    if license_text:
                        item["LicenseText"] = license_text
                    if license_file:
                        item["LicenseFile"] = license_file
                    else:
                        print(f"ERROR: could not locate missing license file for {item['Name']}")
                        continue
                else:
                    clean_path = "." + full_path.partition("iotapi")[2]
                    item["LicenseFile"] = clean_path

            with open(PIP_RAW_OUTPUT, 'w') as pip_license_out_file:
                pip_license_out_file.write(json.dumps(python_json_data, indent=2))


        print("Done.")
    except Exception as e:
        print(f"ERROR: Could not generate license files: {str(e)}")
        traceback.print_exc()
        exit(1)


#
# This routine retrieves the text of the license file for those packages that are missing a reference to their proper
# license file in their configuration or Trove classifier settings. If any package is missing this information,
# we need to go and find them, then add them to this exception list
#
MISSING_LICENSE_LIST = {
    "MarkupSafe": "https://raw.githubusercontent.com/pallets/markupsafe/main/LICENSE.rst",
    "boto3": "https://raw.githubusercontent.com/boto/boto3/develop/LICENSE",
    "botocore": "https://raw.githubusercontent.com/boto/botocore/develop/LICENSE.txt",
    "cffi": "https://foss.heptapod.net/pypy/cffi/-/raw/branch/default/LICENSE",
    "chardet": "https://raw.githubusercontent.com/chardet/chardet/master/LICENSE",
    "coverage": "https://raw.githubusercontent.com/nedbat/coveragepy/master/LICENSE.txt",
    "dnslib": "https://raw.githubusercontent.com/paulc/dnslib/master/LICENSE",
    "docker-py": "https://raw.githubusercontent.com/docker/docker-py/master/LICENSE",
    "future": "https://raw.githubusercontent.com/PythonCharmers/python-future/master/LICENSE.txt",
    "pony": "https://raw.githubusercontent.com/ponyorm/pony/main/LICENSE",
    "psycopg2-binary": "https://raw.githubusercontent.com/psycopg/psycopg2/master/LICENSE",
    "pyfiglet": "https://raw.githubusercontent.com/pwaller/pyfiglet/master/LICENSE",
    "s3transfer": "https://raw.githubusercontent.com/boto/s3transfer/develop/LICENSE.txt",
    "sqlitedict": "https://raw.githubusercontent.com/RaRe-Technologies/sqlitedict/master/LICENSE.md",
    "tootallnate/once": "https://raw.githubusercontent.com/TooTallNate/once/master/LICENSE"
}


def fetch_missing_license(name):
    """
    This function looks up in the above exception list and finds the source for the missing license
    file. If found, we also download save it to the license directory.
    """
    try:
        url = MISSING_LICENSE_LIST.get(name, None)
        if url:
            response = requests.get(url)
            if response:
                content = response.text
                license_file_name = os.path.basename(urlparse(url).path)
                clean_name = name.replace("/", "_")
                output_file = os.path.join(".", LICENSE_DIR, f"{clean_name}-{license_file_name}")
                with open(output_file, 'w') as license_out_file:
                    license_out_file.write(content)

        return output_file, content

    except Exception as e:
        print(f"ERROR: could not retrieve license file for [ {name} ] from [ {url} ] ")

    return None, None


##############################################################################
#
# These were used to test passing parameters between dependent tasks.
# Leaving them here in case there's an issue later.
# To make these work, you have to make sure they're added to the Collection
# down below.
#
# @task()
# def a(c, profile):
#     print(f"A::profile={profile}")
#
# # To have one task pass a task to another, we need to
# @task()
# def b(c, profile):
#     c.invoke_execute(c, 'a', profile=profile)
#     print(f"B::profile={profile}")
#


##############################################################################
# This is used to have one task dynamically invoke another and pass
# runtime parameters to it. Unfortunately, as of this writing there
# doesn't seem to be an easier way to do this in pyinvoke.
#
# Based on https://github.com/pyinvoke/invoke/issues/170
#
# Define and configure root namespace
# ===================================

# NOTE: `namespace` or `ns` name is required!
namespace = Collection(
    # put all tasks or nested collections here
    install,
    bootstrap,
    deploy,
    dbsetup,
    upload,
    cdkupdate,
    nodeupdate,
    mergetest,
    apitest,
    clean,
    checklicense
)

def invoke_execute(context, command_name, **kwargs):
    """
    Helper function to make invoke-tasks execution easier.
    """
    results = Executor(namespace, config=context.config).execute((command_name, kwargs))
    target_task = context.root_namespace[command_name]
    return results[target_task]

namespace.configure({
    'root_namespace': namespace,
    'invoke_execute': invoke_execute,
})


def get_my_ip():
    # We need to get our external IP address to pass down to
    # the bastion host security group. If it's not accessible, it could cover
    # a bigger problem. Note that if you move to a different location and try to
    # update the database via the bastion host, the security group will likely
    # prevent you from being able to access the bastion host and database.
    #
    my_ip = None
    get_ip = requests.get("https://checkip.amazonaws.com/")
    if get_ip.status_code == 200:
        my_ip = get_ip.text.rstrip()

        # The remote call sometimes returns two values with a comma, so we
        # only take the first one.
        #
        if "," in my_ip:
            ip_list = my_ip.split(",")
            my_ip = ip_list[0].rstrip()

    if not my_ip:
        print("ERROR: could not obtain external IP address, needed for bastion host access")
        exit(1)

    return my_ip

