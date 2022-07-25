# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: App Layer: Params
# params.py
#

#
# Library to manage persistent params. This version uses the System Manager\
# parameter store. If we decide to move it somewhere else, it should be
# accessible from the CLI and the CDK so the data can be extracted during
# various setup phases.
#
# NOTE that these values may be deleted once a service has been created and the
# data downloaded to local config files during CDK creation or at runtime.
#
# There is a 10K limit to the number of values that can be stored in the
# parameter store.
#

import json
import os
import boto3
import uuid
import os


def create_param(key, value, desc, profile=None):
    ssm = None
    try:
        if profile:
            ssm = boto3.session.Session(profile_name=profile).client('ssm')
        else:
            ssm = boto3.client('ssm')
        #ldebug(f"Creating SSM Param: [{key}] with value size: {len(value)}")
        ssm.put_parameter(Name=key,
                          Description=desc,
                          Value=value,
                          Type='String',
                          Tier='Intelligent-Tiering',
                          Overwrite=True)
    except Exception as e:
        print(f"Error creating SSM value: {key} - {str(e)}")
        raise e


def create_secret(key, value, desc, profile=None):
    ssm = None
    try:
        if profile:
            ssm = boto3.session.Session(profile_name=profile).client('ssm')
        else:
            ssm = boto3.client('ssm')
        #ldebug(f"Creating SSM Secret: [{key}] with value size: {len(value)}")
        ssm.put_parameter(Name=key,
                          Description=desc,
                          Value=value,
                          Type='SecureString',
                          Tier='Intelligent-Tiering',
                          Overwrite=True)
    except Exception as e:
        print(f"Error creating SSM secret: {key}: {str(e)}")
        raise e


# We delete a key. Silently fail if key doesn't exist
#
def delete_param(key, profile=None):
    #ldebug(f"Deleting SSM Parameter: [{key}]")
    ssm = None
    try:
        if profile:
            ssm = boto3.session.Session(profile_name=profile).client('ssm')
        else:
            ssm = boto3.client('ssm')

        ssm.delete_parameter(Name=key)
    except Exception as e:
        print(f"Exception deleting SSM Secret: {key} : [{str(e)}]")
        pass


def get_param(key, profile=None):
    #ldebug(f"Getting SSM Secret: [{key}]")
    value = None
    ssm = None
    try:
        if profile:
            ssm = boto3.session.Session(profile_name=profile).client('ssm')
        else:
            ssm = boto3.client('ssm')

        data_dict = ssm.get_parameter(Name=key, WithDecryption=True)
        #ldebug(f"Got SSM dict: {data_dict}")
        if data_dict:
            value = data_dict["Parameter"]["Value"]
            #ldebug(f"Got SSM Secret: {str(value)}")
    except Exception as e:
        print(f"Exception getting SSM Secret: [{str(e)}]")
        raise e

    return value


