# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# This is the installer script for SimpleIOT. Once the whole thing has been downloaded,
# you need to run this, answer a few questions, then let it install the components
# needed.
#
import json
import subprocess
from packaging.version import Version, LegacyVersion
import re
from askconfig import get_config_data
import params
import signal
import sys
signal.signal(signal.SIGINT, lambda x, y: sys.exit(0))


APPCONFIG_FILE = "applist.json"

def load_applist():
    config = None
    try:
        with open(APPCONFIG_FILE, 'r') as infile:
            config = json.load(infile)
    except Exception as e:
        print(f"ERROR loading {APPCONFIG_FILE}: {str(e)}")
        exit(1)
    return config


def check_version(app):
    try:
        app_name = app.get("name", "-app-")
        version_cmd = app.get("version_cmd", None)
        version_regexp = app.get("version_regexp", None)
        min_version = app.get("min_version", None)
        if not version_cmd and version_regexp:
            print(f"ERROR: missing field in {APPCONFIG_FILE}.")
            return False
        cmd = version_cmd.split()
        version_str = subprocess.check_output(cmd).decode('utf-8').strip()
        version_match = re.compile(version_regexp)
        re_version = version_match.search(version_str)
        if not re_version:
            print(f"ERROR: version returned '{version_str}' does not match pattern in config file: {version_regexp}")
            return False
        else:
            version = re_version.group(1)

        if Version(version) >= Version(min_version):
            return True
        else:
            print(f"ERROR: {app_name} version is a lower version [{version}] than minimum required version: [{min_version}].")
            update_url = app.get("update_url", "")
            print(f"Please visit {update_url} URL to update")
            return False
    except Exception as e:
        print(f"ERROR: failed to check {app_name} version")
        return False


def check_apps(config):
    print("Checking for pre-requisite Apps")
    for app in config:
        name = app.get("name", None)
        if not name:
            print(f"ERROR: mis-configured {APPCONFIG_FILE}. Missing 'name' field.")
        print(f"- {name}...")
        check = check_version(app)
        if not check:
            print("ERROR installing. Please fix problem and re-run.")
            exit(1)
        else:
            print("- OK")
    print("Pre-requisite Check done")
    return True


def run():
    try:
        # NOTE: if building inside Docker, we no longer need to check for existing apps.
        # We know they'll be there.
        #
        # config = load_applist()
        # ok = check_apps(config)
        # if not ok:
        #     print("Please make sure all pre-requisite apps are installed")
        #     exit(1)
        # else:
        get_config_data()

    except Exception as e:
        print(f"ERROR installing SimpleIOT: {e}")

if __name__ == '__main__':
    try:
        run()
    except Exception as e:
        pass
