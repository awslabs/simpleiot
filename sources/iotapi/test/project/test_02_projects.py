import requests
import common
from faker import Faker

def test_get_all_projects():
    data = common.make_api_request("GET", "project?all=true")
    assert data.status_code == requests.codes.ok, 'REST API request status is not 200'
    return data.json()

def test_get_undefined_project():
    data = common.make_api_request("GET", "project?project_name=BADPROJECT")
    assert data.status_code == 418, 'REST API request should be NOT FOUND (418)'

def test_create_and_delete_project():
    faker = Faker()
    project_name = f"{faker.first_name()}{faker.last_name()}-{faker.license_plate()}"
    payload = {
        "project_name": project_name
    }
    create_action = common.make_api_request("POST", "project", json=payload)
    assert create_action.status_code == 200, f"Project [{project_name}] could not be created."

    delete_action = common.make_api_request('DELETE', f"project?project_name={project_name}")
    assert delete_action.status_code == 200, f"Project [{project_name}] could not be deleted."

def test_create_project_with_missing_name():
    faker = Faker()
    payload = {
    }
    create_action = common.make_api_request("POST", "project", json=payload)
    #
    # It should fail with error 428 - invalid parameter.
    #
    assert create_action.status_code == 428, f"Project creation without name should have failed."


def test_delete_invalid_project():
    faker = Faker()
    project_name = f"{faker.first_name()}{faker.last_name()}-{faker.license_plate()}"
    payload = {
        "project_name": project_name
    }
    delete_action = common.make_api_request('DELETE', f"project?project_name={project_name}")
    assert delete_action.status_code == 418, f"Project [{project_name}] delete should have failed with 418 status code."
