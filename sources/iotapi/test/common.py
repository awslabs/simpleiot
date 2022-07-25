#!/usr/bin/env python

# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# Utilities for testing
#
import click
import json
import requests
import boto3
import os
import config
from dotenv import load_dotenv


def get_config():
    try:
        load_dotenv()  # take environment variables from .env.
    except Exception as e:
        raise e('[.env] file not found in test root directory')

    team = os.getenv("IOT_TEAM")
    assert team, 'IOT_TEAM not defined in .env test file'
    conf = config.load_config(team)
    assert conf, f"Error loading config data for team [{team}]. Make sure it is deployed."
    return conf


def make_api_request(method, command, **kwargs):
    conf = get_config()
    api_endpoint = conf['apiEndpoint']
    assert api_endpoint, "API Endpoint not found in .simpleiot configuration file"
    url = f"{api_endpoint}v1/{command}"
    headers = get_auth_header()
    assert headers, "Could not create API REST authentication header"

    response = requests.request(method, url, headers=headers, **kwargs)
    return response


def make_api_request_with_no_auth(method, command, **kwargs):
    conf = get_config()
    api_endpoint = conf['apiEndpoint']
    assert api_endpoint, "API Endpoint not found in .simpleiot configuration file"
    url = f"{api_endpoint}v1/{command}"
    headers = {}

    response = requests.request(method, url, headers=headers, **kwargs)
    return response


def make_api_request_with_bad_auth(method, command, **kwargs):
    conf = get_config()
    api_endpoint = conf['apiEndpoint']
    assert api_endpoint, "API Endpoint not found in .simpleiot configuration file"
    url = f"{api_endpoint}v1/{command}"
    headers = get_auth_header()
    assert headers, "Could not create API REST authentication header"

    # To make a bad header, we go swap some characters in the JWT token
    #
    token = headers['Authorization']
    bad_token = token[0:10] + ''.join([token[x:x+2][::-1] for x in range(10, len(token)-10, 2)]) + token[-10:]
    assert token != bad_token, "Scrambled token should not be the same as a good JWT token"
    headers['Authorization'] = bad_token
    response = requests.request(method, url, headers=headers, **kwargs)
    return response


def get_auth_header():
    conf = get_config()

    username = os.getenv("IOT_AUTH_USERNAME")
    assert username, "IOT_AUTH_USERNAME not defined in .env configuration file"
    password = os.getenv("IOT_AUTH_PASSWORD")
    assert password, "IOT_AUTH_PASSWORD not defined in .env configuration file"

    userpool = conf.get('cognitoUserPoolName', None)
    assert userpool, "'cognitoUserPoolName' not found in deployment configuration file"
    client_id = conf.get('cognitoClientId', None)
    assert client_id, "'cognitoClientId' not found in deployment configuration file"
    access_token, id_token = get_auth_token(userpool, client_id, username, password)
    assert access_token, "'Could not get JWT access-token from cognito with provided credentials"
    assert id_token

    headers = {
        "Authorization": id_token
    }
    return headers

# For this to work the Cognito user pool should have been set to ADMIN_NO_SRP_AUTH auth flow.
#
def get_auth_token(userpool, client_id, username, password):
    access_token = None
    id_token = None
    cognito = None

    try:
        if not userpool:
            print(f"INTERNAL ERROR: missing Cognito userpool in config file")
            exit(1)
        if not client_id:
            print(f"INTERNAL ERROR: missing Cognito Client ID in config file")
            exit(1)

        cognito = boto3.client('cognito-idp')

        resp = cognito.initiate_auth(
            ClientId=client_id,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password
            }
        )
        access_token = resp['AuthenticationResult']['AccessToken']
        id_token = resp['AuthenticationResult']['IdToken']
    except cognito.exceptions.UserNotFoundException:
        print("ERROR: User not found")
    except cognito.exceptions.NotAuthorizedException:
        print("ERROR: login not authorized")
    except Exception as e:
        print(f"ERROR: {str(e)}")

    return access_token, id_token
