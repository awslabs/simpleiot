import os
import common
import config
import requests
from dotenv import load_dotenv


def test_get_auth_token():
    load_dotenv()  # take environment variables from .env.

    team = os.getenv("IOT_TEAM")
    assert team
    username = os.getenv("IOT_AUTH_USERNAME")
    assert username
    password = os.getenv("IOT_AUTH_PASSWORD")
    assert password
    conf = config.load_config(team)
    assert conf
    userpool = conf.get('cognitoUserPoolName', None)
    assert userpool
    client_id = conf.get('cognitoClientId', None)
    assert client_id

    access_token, id_token = common.get_auth_token(userpool, client_id, username, password)
    assert access_token
    assert id_token


def test_get_project_without_auth():
    data = common.make_api_request_with_no_auth("GET", "project?all=true")
    assert data.status_code == 401, 'REST API request status should be unauthorized'


def test_get_project_with_bad_auth():
    data = common.make_api_request_with_bad_auth("GET", "project?all=true")
    assert data.status_code == 401, 'REST API request status should be unauthorized'
