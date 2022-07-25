# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Database utilities
# dbutil.py
#
# These are invoked by the database hooks to handle cleanup after record deletion.
#
import os
import traceback


# print("Importing iot module")
from iotapp.iotthing import *

# print("Importing gg module")
from iotapp.iotgg import *


def delete_iot_if_needed(iot_config_data, is_gateway):
    """
    This is invoked before a project, model, or device record is deleted. It checks to see if
    they have an IOT thing associated. If it does, it will be deleted.
    :param is_gatway: Boolean - True if this is a GG device, False if it's an IOT Thing
    :param iot_config_data: string - IOT configuration data
    :return:
    """
    print(f"About to delete item")
    if iot_config_data:
        #print(f"Have iot_config_data {iot_config_data}")
        try:
            iot_data = json.loads(iot_config_data)
            #print(f"Deleting iot_thing with {str(iot_data)}")
            if is_gateway:
                delete_iot_gg(iot_data)
            else:
                delete_iot_thing(iot_data)
            #print(f"Deleting iot_thing done")
        except Exception as e:
            print(f"ERROR deleting Project IOT Thing: {str(e)}")
    else:
        print("No iot to delete")
