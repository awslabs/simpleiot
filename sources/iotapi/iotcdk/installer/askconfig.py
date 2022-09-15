# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# This routine asks for the minimum items needed to bootstrap the installer
# process.
#
# NOTE: if the answers to any of the questions are found in an environment variable
# we don't ask that question. This will help in future integration with CI/CD pipelines.
#

import json
import tempfile
import boto3
import re
import traceback
import questionary
from questionary import Validator, ValidationError, prompt
import secrets
import random
import string
from rich import print
from rich.console import Console
from rich.table import Table
from . import params

# This is needed to import utilities from a common parent folder.
#
import sys
import os
PACKAGE_PARENT = '../..'
SCRIPT_DIR = os.path.dirname(os.path.realpath(os.path.join(os.getcwd(), os.path.expanduser(__file__))))
sys.path.append(os.path.normpath(os.path.join(SCRIPT_DIR, PACKAGE_PARENT)))

#
# NOTE: we should get this out of the defaults.json.
#
SAVED_TEAM_NAME_FILE = "simpleiot_last_install_team.txt"


from util.config import * # Shared config routines between subsystems

#################################################################
# Modify this to enable or disable certain questions being asked. As a shortcut
# just set the ENTERPRISE_INSTALL to True and it will ask for more questions
# related to enterprise settings. The default is False, which asks fewer
# installer questions, suitable for small projects.

ENTERPRISE_INSTALL = False

if ENTERPRISE_INSTALL:
    ASK_FOR_SSO = True
    ASK_FOR_SAML_PATH = True
    ASK_FOR_ADMIN_PASSWORD = True
    ASK_FOR_BASTION_HOST = True
else:
    ASK_FOR_SSO = False
    ASK_FOR_SAML_PATH = False
    ASK_FOR_ADMIN_PASSWORD = True
    ASK_FOR_BASTION_HOST = False

##################################################################
console = Console()

ADMIN_PASSWORD_STRING_LENGTH = 10
ADMIN_PASSWORD_NUMBER_LENGTH = 5
ADMIN_PASSWORD_SYMBOL_LENGTH = 3
ADMIN_PASSWORD_SYMBOLS = "#-_!$"

class IsEmptyValidator(Validator):
    def validate(self, document):
        if len(document.text) == 0:
            raise ValidationError(
                message="Please enter a value",
                cursor_position=len(document.text),
            )
#
# NOTE: if the initial json file exists, let's load it in and get the defaults from there.
#

def get_config_data(team):
    try:
        data = False

        if ASK_FOR_SSO:
            use_sso = questionary.confirm("Do you use AWS Single Sign-on (SSO) for authentication (if unsure, answer No)?",
                                          default=data).ask()
            if use_sso:
                data = configure_with_sso(team)
            else:
                data = configure_with_cognito(team)
        else:
            data = configure_with_cognito(team)

        return data

    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"ERROR getting config data: {str(e)}")

#
# When configuring with SSO, we go get the credentials needed to access the account.
# We're assuming the installer person is also under SSO so we don't do anything with
# standard AWS configure profiles.
#
def configure_with_sso(team):
    try:
        config = {}

        if team:
            config = load_bootstrap_config(team)

        # We use the utility routine that logs in the current user with SSO.

        sso_url, sso_region, account_id, account_role, account_name, access_key, access_secret, session_token = \
            login_with_sso(config)

        # We also need the SAML 2.0 Metadata XML file. If you don't have this, you should get it from your
        # IDP. For example, here's how Okta provides it:
        # https://support.okta.com/help/s/article/How-do-we-download-the-IDP-XML-metadata-file-from-a-SAML-Template-App?language=en_US
        #
        # If you need to create it manually, you could try this: https://www.samltool.com/idp_metadata.php
        #
        # For more information on what CDK needs: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-iam-readme.html
        #
        # If you don't have any idea what any of this is all about, you probably shouldn't be using SSO ;-)
        #
        if ASK_FOR_SAML_PATH:
            saml_meta_data = questionary.path("Path to your SSO SAML 2.0 Metadata XML file?",
                                           validate=IsEmptyValidator).ask()
        else:
            saml_meta_data = None

        #
        # The Organization name is mainly used for display and reporting purposes. In future versions
        # we will likely have a centralized Organizer database.
        #
        org_name = os.getenv('IOT_INSTALL_ORG_NAME', None)
        if not org_name:
            org_name = questionary.text("Organization name?", validate=IsEmptyValidator).ask()

        #
        # The team name is important if you are going to be using the CLI to hit multiple SimpleIOT
        # installations. This allows you to save your settings under a 'Team' ID which can then be used
        # to invite others to join the team. It is also used to create directories in the ~/.simpleiot
        # folder, so it should be filesystem-name compliant. To switch between teams, on the CLI
        # you can specify:
        #
        #    iot --team={team-id} command...
        #
        # You can mix SSO and non-SSO teams.
        #
        team_name_raw = os.getenv('IOT_INSTALL_TEAM_NAME', None)
        if not team_name_raw:
            team_name_raw = questionary.text("Short team name (letters and numbers only)?", validate=IsEmptyValidator).ask()

        team_name = re.sub('[^0-9a-zA-Z_]', '', team_name_raw)

        #
        # For most simple cases, you'll want to create a database Bastion which is a linux EC2 instance
        # that can be logged into remotely but only via SSH. If you answer yes, we'll create an SSH key
        # (which gets downloaded to this machine), then create the EC2 bastion and set up the rules
        # so it can only be reached via SSH (you can further restrict it by going into EC2 Security Groups
        # and further tighten access to specific IP addresses). This bastion host is the only way to access
        # the database inside the VPC we create from the outside world. The lambdas that interact with the
        # database are all inside the VPC so they are secure. However, we do need to remotely instantiate and
        # update the database, which is why the EC2 bastion is there.
        #
        # If you are in an enterprise setting where access from your machine to the RDS instance is already
        # protected by a VPN or Transit Gateway, then you don't need an extra Bastion, so you can answer NO.
        # In that case, the database loader assumes that it can directly access RDS and won't try to establish
        # an SSH tunnel.
        #
        if ASK_FOR_BASTION_HOST:
            db_bastion = questionary.confirm(
                "Do you want a Bastion Host to protect access to the database (if unsure, answer Yes)?",
                default=True).ask()
        else:
            db_bastion = True

        # Show the user the answers and confirm.
        #
        table = Table(show_header=True, header_style="green")
        table.add_column("Name", style="dim")
        table.add_column("Value")

        table.add_row("Team Name", team_name)
        table.add_row("Organization", org_name)
        if ASK_FOR_SSO:
            table.add_row("SSO URL", sso_url)
            table.add_row("SSO Region", sso_region)
            table.add_row("SSO Account", account_name)
            table.add_row("SSO Role", account_role)
        if ASK_FOR_SAML_PATH:
            table.add_row("SAML Metadata file: ", saml_meta_data)

        table.add_row("Account ID", account_id)
        if ASK_FOR_BASTION_HOST:
            table.add_row("Database Bastion", "Yes" if db_bastion else "No")

        console.print(table)

        proceed = questionary.confirm("Proceed? ").ask()
        if not proceed:
            # print(f">>> TEMP ACCESS KEY: {access_key}")
            # print(f">>> TEMP ACCESS SECRET: {access_secret}")
            # print(f">>> TEMP SESSION TOKEN: {session_token}")
            return None
        else:
            data = {
                "account": account_id,
                "region": sso_region,
                "team": team_name,
                "org_name": org_name
            }
            if ASK_FOR_SSO:
                data["use_sso"] = True
                data["sso_url"] = sso_url
                data["sso_account_name"] = account_name
                data["sso_account_role"] = account_role

            if ASK_FOR_SAML_PATH:
                data["saml_metadata_path"] = saml_meta_data

            if ASK_FOR_BASTION_HOST:
                data["db_bastion"] = db_bastion

            save_bootstrap_config(data, team_name)
            save_to_tempfile(SAVED_TEAM_NAME_FILE, team_name)

            return data

    except Exception as e:
        print(f"ERROR: {str(e)}")
        # traceback.print_exc()
        return None


def snake_case(s):
    return '_'.join(re.sub('([A-Z][a-z]+)', r' \1',
                           re.sub('([A-Z]+)', r' \1',
                                  s.replace('-', ' '))).split()).lower()


def configure_with_cognito(team):
    config = None
    use_sso = False
    try:
        if team:
            config = load_config(team)

        if config:
            aws_profile = config.get("aws_profile", 'default')
            account = config.get("account", None)
            region = config.get("region", None)
            admin_password = config.get("admin_password", None)
            org_name = config.get("org_name", "")
            db_bastion = config.get("db_bastion", True)
            use_sso = config.get("use_sso", False)

        else:
            team = "simpleiot"
            aws_profile = 'default'
            account = None
            region = None
            org_name = ""

        got_profile = False
        retries = 3
        while not got_profile:
            if retries == 0:
                print("Too many retries. Exiting installation. Please try again later.")
                exit(1)

            profiles = boto3.session.Session().available_profiles
            if not profiles:
                print("Hmmm... No AWS configuration found. Running 'aws configure'...")
                print("Check here for an explanation of prompts:\n   https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html\n")
                try:
                    os.system("aws configure")
                    # print(f"Please configure an AWS profile using 'aws configure' command.")
                    # print(f"More information: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html")
                    # exit(1)
                except Exception as e:
                    print(f"Installation cancelled.")
                    exit(0)
                retries -= 1
            else:
                got_profile = True

        #
        # If an environment variable is defined, we honor that one. Usable for automation.
        #
        aws_profile = os.getenv('IOT_INSTALL_AWS_PROFILE', None)
        if not aws_profile:
            #
            # If none specified, we check to see if there is only a single profile specified.
            # If so, we only use that one and don't bother asking the user.
            #
            if len(profiles) == 1:
                aws_profile = profiles[0]
            else:
                #
                # If we're here, there are multiple profiles, so we ask them to choose one from the list.
                #
                aws_profile = questionary.select("Choose AWS profile to use (default): ",
                                                 choices=profiles, default=aws_profile).ask()

        b3 = boto3.session.Session(profile_name=aws_profile)
        account = b3.client('sts').get_caller_identity().get('Account')
        if not account:
            print(f"ERROR: No valid account associated with profile. Please correct and run again.")
            return None

        region = b3.region_name
        if not region:
            print(f"ERROR: No valid region associated with profile. Please correct and run again.")
            return None

        org_name = os.getenv('IOT_INSTALL_ORG_NAME', None)
        if not org_name:
            org_name = questionary.text("Organization name?", validate=IsEmptyValidator).ask()

        admin_email = os.getenv('IOT_INSTALL_ADMIN_EMAIL', None)
        if not admin_email:
            admin_email = questionary.text("Administrator email?",
                                             validate=IsEmptyValidator).ask()

        #
        # NOTE: Cognito passwords require strings, numbers, and symbols. We need to guarantee that
        # some of each exist, so we create a random number of each and combine them. If you want to change
        # the default password rules, here's where you do it.
        #
        admin_password_str = ''.join(
            secrets.choice(string.ascii_letters) for i in range(ADMIN_PASSWORD_STRING_LENGTH))
        admin_password_num = ''.join(secrets.choice(string.digits) for i in range(ADMIN_PASSWORD_NUMBER_LENGTH))
        admin_password_sym = ''.join(
            secrets.choice(ADMIN_PASSWORD_SYMBOLS) for i in range(ADMIN_PASSWORD_SYMBOL_LENGTH))
        admin_password_raw = admin_password_str + admin_password_num + admin_password_sym
        admin_password = ''.join(random.sample(admin_password_raw, len(admin_password_raw)))

        if ASK_FOR_ADMIN_PASSWORD:
            admin_password_env = os.getenv('IOT_INSTALL_ADMIN_PASSWORD', None)
            if admin_password_env:
                admin_password = admin_password_env
            else:
                admin_password = questionary.text(f"Dashboard Admin Password (enter)?",
                                              validate=IsEmptyValidator, default=admin_password).ask()

        team_name_raw = os.getenv('IOT_INSTALL_TEAM_NAME', None)
        if not team_name_raw:
            if org_name:
                short_team_candidate = snake_case(org_name)
            else:
                short_team_candidate = aws_profile

            team_name_raw = questionary.text("Short team name (letters and numbers only)?",
                                             validate=IsEmptyValidator, default=short_team_candidate).ask()

        team_name = re.sub('[^0-9a-zA-Z_-]', '', team_name_raw)

        if ASK_FOR_BASTION_HOST:
            db_bastion_str = os.getenv('IOT_INSTALL_ADMIN_PASSWORD', None)
            if db_bastion_str:
                db_bastion = bool(db_bastion_str)
            else:
                db_bastion = questionary.confirm("Do you want a Bastion Host to protect access to the database (if unsure, answer Yes)?",
                                          default=True).ask()
        else:
            db_bastion = True

        table = Table(show_header=True, header_style="green")
        table.add_column("Name", style="dim")
        table.add_column("Value")
        table.add_row("Team Name", team_name)
        table.add_row("Organization", org_name)
        table.add_row("Admin Email", admin_email)
        table.add_row("AWS Profile", aws_profile)
        table.add_row("AWS Account", account)
        table.add_row("AWS Region", region)
        if ASK_FOR_ADMIN_PASSWORD:
            table.add_row("Admin Password", admin_password)

        table.add_row("AWS SSO", "Yes" if use_sso else "No")
        table.add_row("Database Bastion", "Yes" if db_bastion else "No")
        console.print(table)

        proceed_str = os.getenv('IOT_INSTALL_PROCEED', None)
        if proceed_str:
            proceed = bool(proceed_str)
        else:
            proceed = questionary.confirm("Proceed? ").ask()

        if not proceed:
            return None
        else:
            data = {
                "use_sso": False,
                "team": team_name,
                "aws_profile": aws_profile,
                "account": account,
                "region": region,
                "org_name": org_name,
                "admin_email": admin_email,
                "db_bastion": db_bastion
            }

            # We don't actually store the admin password anywhere. Instead, we load it into
            # SSM store as an encrypted value.
            #
            if ASK_FOR_ADMIN_PASSWORD:
                params.create_secret(f"/simpleiot/{team_name}/admin_password",
                                     admin_password, f"Admin Password for team '{team_name}'",
                                     aws_profile)

            save_bootstrap_config(data, team_name)

            # We write the chosen profile name to a file
            # so subsequent bootstrapping steps can find it.
            #
            save_to_tempfile(SAVED_TEAM_NAME_FILE, team_name)
            return data

    except KeyboardInterrupt:
        print(f"Installation stopped.")
        return None
    except Exception as e:
        print(f"ERROR: {str(e)}")
        exit(1)


if __name__ == '__main__':
    team_id = None
    try:
        if len(sys.argv) > 1:
            team_id = str(sys.argv[1])

        result = get_config_data(team_id)
        if not result:
            exit(1)

    except KeyboardInterrupt:
        pass
