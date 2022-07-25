# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Data
# iot_api_data
#
import os
import boto3
import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.utils import *
from iotapp.params import *
from iotapp.logger import *
import os
from datetime import datetime
import time
import traceback

iot_endpoint = None
ts_database = None
ts_tablename = None
iotclient = None
tsclient = None
geo = None

# NOTE: SSM key for the IOT endpoint.
# should match value in iot_static_setup/main.py.

SIMPLEIOT_IOT_ENDPOINT_KEY = "/simpleiot/iot/endpoint"

region = os.environ['AWS_REGION']

try:
    iot_endpoint = get_param(SIMPLEIOT_IOT_ENDPOINT_KEY)
    ldebug(f"IOT endpoint: {iot_endpoint}")
    iotclient = boto3.client('iot-data',
                             region_name=region,
                             endpoint_url=f"https://{iot_endpoint}")
except Exception as e:
    ldebug(f"No SSM parameter with {SIMPLEIOT_IOT_ENDPOINT_KEY} found")
    pass

try:
    ts_database = os.environ["TS_DATABASE"]
    ts_tablename = os.environ["TS_TABLENAME"]
    if ts_database and ts_tablename:
        tsclient = boto3.client(
            'timestream-write',
            region_name=region)
except Exception as e:
    ldebug("Unable to connect to TIMESTREAM client")
    pass

try:
    dynamodb_table = os.environ['DYNAMODB_TABLE']
    dynamodb_client = boto3.client('dynamodb', region_name=region)
    dynamodb = boto3.resource('dynamodb', region_name=region)
    dynamodb_table = dynamodb.Table(dynamodb_table)
    ddb_exceptions = dynamodb_client.exceptions

except Exception as e:
    ldebug("Unable to connect to DynamoDB table")

# RDS database connection
connect_database()


def format_one(rec):
    return_data = {
        "id": rec.id.hex,
        "name": rec.type.name,
        "serial": rec.device.serial_number,
        "model": rec.device.model.name,
        "project": rec.device.device_project.name
    }
    if rec.value:
        return_data["value"] = rec.value
    if rec.type.name:
        return_data["name"] = rec.type.name
    if rec.type.desc:
        return_data["desc"] = rec.type.desc
    if rec.position:
        return_data["position"] = rec.position
    if rec.dimension:
        return_data["dimension"] = rec.dimension
    if rec.timestamp:
        return_data['timestamp'] = rec.timestamp.isoformat()

    # If there's a format and we can properly assign it, format the data using
    # python format string. We may eventually want to support proper embedded
    # expression processing inside here.
    #
    try:
        label_format = rec.type.label_template
        if label_format:
            label = label_format.format(**return_data)
            if label:
                return_data["label"] = label
    except Exception as e:
        lerror(f"Error formatting label - template: {label_format} : {str(e)}")
        pass

    return return_data


# This is used to format all the data -- assumes there's a local format_one method in the current
# object.
#
def format_all(recs):
    return_data = []
    for rec in recs:
        one = format_one(rec)
        return_data.append(one)
    return return_data


@db_session
def get_record(params, return_raw=False):
    """
    Called with the GET REST call to retrieve one or more records.
    :param params:
    :return:
    """
    code = 200
    result = {}
    try:
        model = None
        project = None
        device = None

        if params:
            project = find_project(params)
            if not project:
                code = 418
                result = {"status": "error", "message": "Data could not be found. Invalid project"}
            else:
                device = find_device(params, project)
                if not device:
                    code = 418
                    result = {"status": "error", "message": "Data could not be found. Invalid device"}
                else:
                    data_name = params.get("name", "")
                    if not data_name:
                        code = 418
                        result = {"status": "error", "message": "Data could not be found. Invalid Data Name"}
                    else:
                        device_data = Data.select(lambda
                                                      dd: dd.device.serial_number == device.serial_number and
                                                          dd.type.name == data_name).first()

                    # If coming through MQTT, we return the raw record
                    if device_data:
                        code = 200
                        formatted_data = format_one(device_data)
                        if return_raw:
                            result = formatted_data
                        else:
                            result = json.dumps(formatted_data)
                    else:
                        code = 418
                        result = json.dumps({"status": "error", "message": "Can not find Data value"})

    except Exception as e:
        lerror(f"ERROR getting record: {str(e)}")
        code = 500
        result = json.dumps({"status": "error", "message": str(e)})

    ldebug(f"Returning result: {result}")
    return code, result


@db_session
def modify_record(params, send_to_mqtt=True):
    """
    Called with the PUT REST call to modify an existing record.

    :param params:
    :param send_to_mqtt: if the data came from the device via MQTT this is set to True
    so we don't re-broadcast the change back out. If set to True, then presumably the change came via
    the REST API so the record is updated in the database AND the value is published to AWS IOT
    so anyone listening to that topic is notified.
    NOTE that we also have a rule set up in AWS IOT so anything sent to simpleiot/.../data/
    is reflected back out to the monitor topic. This way, a tool that wants to monitor

    ALL traffic can just subscribe to that topic and get the raw data. We may not want to
    do it that way if we start doing data validation on the server side.

    Note that ONLY Data elements marked as show_on_twin will transmit MQTT updates.
    This way, variables that are internal and do now need to be shown externally will not
    receive updates. We may want to revisit this decision if the dashboard is going to show
    ALL values vs. only those marked as showable on a Digital Twin.

    :return:
    """
    code = 200
    result = {}
    device = None
    data_set = {}

    try:
        project = find_project(params)
        if not project:
            code = 418
            result = {"status": "error", "message": "Data could not be set. Invalid project"}
        else:
            ldebug(f"Found project: {project.name}")
            device = find_device(params, project)
            if not device:
                code = 418
                result = {"status": "error", "message": "Data could not be set. Invalid device"}
            else:
                ldebug(f"Found Device with serial: {device.serial_number}")
                name_str = params.get("name", None)
                if name_str:
                    value = params.get("value", "")
                    data_set[name_str] = value
                else:
                    data_str = params.get("data", None)
                    if data_str:
                        data_list = data_str.split(",")
                        for d in data_list:
                            kv = d.split('=')
                            if len(kv) == 2:
                                k = kv[0]
                                if k:
                                    k = k.strip()
                                v = kv[1].strip()
                                if v:
                                    v = v.strip()
                                data_set[k] = v
                            else:
                                ldebug(f"Invalid key/value: {d}. Skipping.")
                    else:
                        code = 418
                        result = {"status": "error", "message": "Data could not be set. Missing 'name' or 'data' parameter"}

                position = params.get("position", None)
                dimension = params.get("dimension", None)

                # Let's see if we have some data to set.
                # NOTE: we mark all data with the same lat/long (if specified).
                #
                result_set = []
                if len(data_set) > 0:
                    # If location data is specified, we set the device last-known position AND
                    # send the value up to location services. NOTE: only ONE value per device
                    # should have location data, otherwise you'll mess up mapping.
                    #
                    lat = params.get("geo_lat", None)
                    lng = params.get("geo_lng", None)
                    alt = params.get("geo_alt", None)

                    if device.model.has_location_tracking:
                        tracker = device.model.tracker_name  # check that a tracker is specified
                        if tracker:
                            try:
                                geo = boto3.client("location", region_name=region)

                                if alt:
                                    device.set(geo_alt=alt)
                                if lat and lng:
                                    device.set(geo_lat=lat)
                                    device.set(geo_lng=lng)
                                    updates = [
                                        {
                                            "DeviceId": device.serial_number,
                                            "SampleTime": datetime.now().isoformat(),
                                            "Position": [float(lng), float(lat)]
                                        }
                                    ]
                                    response = geo.batch_update_device_position(TrackerName=tracker,
                                                                                Updates=updates)
                                    ldebug(f"GEO Tracker update response: {response}")
                            except Exception as e:
                                ldebug("Unable to connect to LOCATION SERVICES client")

                    for n in data_set.keys():
                        v = data_set[n]
                        type = DataType.select(lambda dt: dt.model.model_project == project and
                                                          dt.model == device.model and
                                                          dt.name == n).first()
                        if not type:
                            code = 418
                            result = {"status": "error",
                                      "message": "Data could not be set. 'name' parameter does not match"}
                        else:
                            type_name = type.name
                            ldebug(f"Found type name: {type_name}")

                        # NOTE: we need to send this to the Data DDB (vs. Device DDB)
                        #
                        try:
                            # DynamoDB write

                            ddb_key = f"{project.name}:{device.serial_number}:{n}"
                            timestamp_nano = time.time_ns()
                            timestamp_tr = format_nanosec(timestamp_nano)
                            ddb_data = {
                                    'id': ddb_key,
                                    'name': n,
                                    'value': v,
                                    'project': project.name,
                                    'model': device.model.name,
                                    "serial": device.serial_number,
                                    "timestamp": timestamp_tr,
                                    "recorded_at": timestamp_nano
                                }
                            if lat:
                                ddb_data['latitude'] = lat
                            if lng:
                                ddb_data['longitude'] = lng
                            if alt:
                                ddb_data['altitude'] = lng

                            response = dynamodb_table.put_item(
                                Item=ddb_data
                            )
                        except Exception as e:
                            ldebug(f"Error writing to DynamoDB: {str(e)}")

                        type = DataType.select(
                            lambda dt: dt.model == device.model and dt.name == n).first()
                        if not type:
                            code = 418
                            result = {"status": "error", "message": f"Data could not be set. Invalid data type for name: {n}"}
                        else:
                            ldebug(f"Found data type for: {n}")
                            data = Data.get(type=type, device=device)
                            if data:
                                # NOTE: if value is the same, we can set it up so we don't update
                                # each one.

                                ldebug(f"Found Data: {n}")
                                data.set(value=str(v))
                                if position:
                                    data.set(position=str(position))
                                if dimension:
                                    data.set(dimension=str(dimension))
                                data.set(timestamp=datetime.utcnow())
                                ldebug(f"Data {n} set to value: {v}")
                                commit()
                                # print(f"Created a new data record with {n} = {v}")

                                # Now send it out to MQTT for those listening.
                                # Also to timestream. We need to eventually provide a way to make this optional
                                if data.type.show_on_twin:
                                    publish_mqtt_update(data, params, send_to_mqtt)
                                    submit_to_timestream(data, params)

                                code = 200
                                result = format_one(data)
                                result_set.append(result)
                            else:
                                # Doesn't exist so we have to create it. To create it, we have to find the data type based on name
                                ldebug("Data record doesn't exist. Creating.")
                                position = params.get("position", "")
                                dimension = params.get("dimension", "")

                                data = Data(device=device,
                                            type=type,
                                            value=str(v),
                                            position=str(position),
                                            dimension=str(dimension)
                                            )
                                commit()
                                # print(f"Created a new datatype record with {name} = {value}")

                                # Now send it out to MQTT for those listening.
                                # Also to timestream. We need to eventually provide a way to make this optional
                                if data.type.show_on_twin:
                                    publish_mqtt_update(data, params, send_to_mqtt)
                                    submit_to_timestream(data, params)

                        ldebug(f"Data {n} created with value: {v}")

                    code = 200
                    result = {"status": "ok", "data": result_set}

                else:
                    code = 418
                    result = {"status": "error", "message": "Name and value (or data) not specified."}

    except Exception as e:
        lerror(f"Error setting Device Data: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        raise e

    return code, json.dumps(result)


def format_nanosec(nanosec):
    dt = datetime.fromtimestamp(nanosec / 1e9)
    time_str = '{}.{:09.0f}'.format(dt.strftime('%Y-%m-%dT%H:%M:%S'), nanosec % 1e9)
    return time_str


@db_session
def delete_record(params):
    """
    Called with the DELETE REST call to remove a record.

    NOTE: we should do a sideways call to delete all the device data that have this type, one by one.
    This way, the Thing and GG items will also be deleted properly. Only after all have been deleted
    should we delete the record out of the database.

    :param params:
    :return:
    """
    code = 200
    result = {}
    try:
        if params:
            project = find_project(params)
            if not project:
                code = 418
                result = {"status": "error", "message": "Data could not be set. Invalid Project"}
            else:
                device = find_device(params, project)
                if not device:
                    code = 418
                    result = {"status": "error", "message": "Data could not be set. Invalid Device"}
                else:
                    data_name = params.get("name", "")
                    if not data_name:
                        code = 418
                        result = {"status": "error", "message": "Data could not be set. Data name required"}
                    else:
                        type = DataType.select(
                            lambda dt: dt.model == device.model and dt.name == data_name).first()
                        if not type:
                            code = 418
                            result = {"status": "error", "message": "Data could not be set. Invalid data type"}
                        else:
                            device_data = Data.select(lambda dd: dd.device == device and dd.type == type).first()
                            if device_data:
                                device_data_id = device_data.id.hex
                                device_data.delete()
                                commit()
                                result = {"status": "ok", "id": device_data_id}
                                code = 200
                            else:
                                code = 418
                                result = {"status": "error", "message": "Data record not found"}
    except Exception as e:
        lerror(f"Error deleting device data {name}: str(e)")
        code = 500
        result = {"status": "error", "message": str(e)}
        raise e

    return code, json.dumps(result)


#
# This is called to publish an update event, when it arrives from the API.
# Data changes that arrive via MQTT get republished to a general 'monitor'
# topic, along with formatted metadata from the database.
#
#
def publish_mqtt_update(data, params, api_update=False):
    project = data.device.device_project.name
    model = data.device.model.name
    serial = data.device.serial_number
    name = data.type.name
    value = data.value
    payload = format_one(data)
    lat = params.get("geo_lat", None)
    if lat:
        payload["geo_lat"] = lat
    lng = params.get("geo_lng", None)
    if lng:
        payload["geo_lng"] = lng
    alt = params.get("geo_alt", None)
    if alt:
        payload["geo_alt"] = alt

    payload_str = json.dumps(payload)
    if api_update:
        mqtt_topic = f"simpleiot_v1/app/data/set/{project}/{model}/{serial}/{name}"
        ldebug(f"Sending IOT update to {mqtt_topic} with payload: {payload_str}")
        if iotclient:
            response = iotclient.publish(
                topic=mqtt_topic,
                qos=1,
                payload=payload_str
            )
    # Regardless, we update the common monitor topic
    monitor_topic = f"simpleiot_v1/app/monitor/{project}/{model}/{serial}/{name}"
    ldebug(f"Sending IOT update to {monitor_topic} with payload: {payload_str}")

    if iotclient:
        response = iotclient.publish(
            topic=monitor_topic,
            qos=1,
            payload=payload_str
        )


#
# We get the record that was saved to the database, but we also look at the original
# params payload sent in to see if lat/lng data was specified. Currently we don't
# save that data in the database by itself, but in the future we might.
#
def submit_to_timestream(rec, params):
    global tsclient, ts_database, ts_tablename

    if not tsclient:  # no timestream database specified
        return

    data_type_value = 'DOUBLE'
    try:
        data_type = rec.type.data_type
        if data_type:
            data_type_str = data_type.lower()
            if data_type_str == 'str' or data_type_str == 'string':
                data_type_value = 'VARCHAR'
            elif data_type_str == 'num' or \
                    data_type_str == 'number' or \
                    data_type_str == 'float' or \
                    data_type_str == 'double':
                data_type_value = 'DOUBLE'

        # These are values sent with every data point.
        #
        common_attributes = {
            'Dimensions': [
                {
                    'Name': "Project",
                    'Value': rec.device.device_project.name,
                    'DimensionValueType': 'VARCHAR'
                },
                {
                    'Name': "Model",
                    'Value': rec.device.model.name,
                    'DimensionValueType': 'VARCHAR'
                },
                {
                    'Name': "Serial",
                    'Value': rec.device.serial_number,
                    'DimensionValueType': 'VARCHAR'
                }
            ]
        }

        # Add lat/long if specified

        dimension_lat = None
        dimension_lng = None
        dimension_list = None

        current_lat = params.get("geo_lat", None)
        current_lng = params.get("geo_lng", None)

        if current_lat:
            dimension_lat = {
                'Name': "latitude",
                'Value': str(current_lat),
                'DimensionValueType': "VARCHAR"
            }
        if current_lng:
            dimension_lng = {
                'Name': "longitude",
                'Value': str(current_lng),
                'DimensionValueType': "VARCHAR"
            }

        if dimension_lat and dimension_lng:
            dimension_list = [dimension_lat, dimension_lng]

        # if rec.dimension:
        #     dimension_list.append(rec.dimension)

        payload = {
            'Time': str(time.time_ns()),
            'TimeUnit': "NANOSECONDS",
            'MeasureName': rec.type.name,
            'MeasureValue': str(rec.value),
            'MeasureValueType': data_type_value
        }
        if dimension_list:
            payload['Dimensions'] = dimension_list

        if not ts_database:
            ts_database = os.environ["TS_DATABASE"]
        if not ts_tablename:
            ts_tablename = os.environ["TS_TABLENAME"]

        if ts_database and ts_tablename:
            response = tsclient.write_records(
                CommonAttributes=common_attributes,
                DatabaseName=ts_database,
                TableName=ts_tablename,
                Records=[payload]
            )
            ldebug(f"Timestream write status: {response['ResponseMetadata']['HTTPStatusCode']}")
        else:
            ldebug(f"No Timestream database and table found")

    except Exception as e:
        raise Exception(f"Timestream error error: {e}")


#
# {
#     "action": {get/set/delete},
#     "project": {project name},
#     "device": {serial number},
#     "name": {data key name},
#     "value": {option value if a set operation}
# }
#
#
# In the case of set/delete no response is sent.
# In the case of gets, the response will go back to the topic:
#
# v1/{serial number}/device/data/value
#
# With a payload:
#
# {
#     "project": {project name},
#     "device": {serial number},
#     "name": {data key name},
#     "value": {value from db},
#     "last_update": {time of last update in UTC}
# }

@db_session
def process_as_iot_request(params):
    result = {}
    code = 500

    try:
        param_str = json.dumps(params)
        ldebug(f"Responding to IOT Data MQTT request: payload: {param_str}")
        action = params.get("action", None)
        if action:
            if action == "set":
                code, result = modify_record(params, send_to_mqtt=False)
            elif action == "delete":
                code, result = delete_record(params)
            else:
                code, data = get_record(params, return_raw=True)
                if code == 200:
                    if data:
                        project = data.device.device_project.name
                        model = data.device.model.name
                        serial = data.device.serial_number
                        name = data.name
                        payload = format_one(data)
                        payload_str = json.dumps(payload)
                        serial = data.get("serial", "")
                        payload_str = json.dumps(data)
                        mqtt_topic = f"simpleiot_v1/app/data/get/{project}/{model}/{serial}/{name}/value"
                        ldebug(
                            f"Responding to IOT Data GET MQTT request: topic: {mqtt_topic} - payload: {payload_str}")
                        if iotclient:
                            response = iotclient.publish(
                                topic=mqtt_topic,
                                qos=1,
                                payload=payload_str
                            )
                        result = payload_str
                else:
                    code = 418
                    result = json.dumps(
                        {"status": "error", "message": "Could not find Data record for this device"})

    except Exception as e:
        lerror(f"ERROR accessing record via MQTT: {str(e)}")
        code = 500
        result = json.dumps({"status": "error", "message": str(e)})

    return code, result


#
# This lambda is called via both normal API gateway calls as well as via MQTT
# calls from an IOT rule.
#
def lambda_handler(event, context):
    result = {}
    code = 200
    method = ""

    try:
        method = event.get("httpMethod", None)  # HTTP RESTful calls
        if method:
            linfo(f"METHOD: {method}")

            if method == "POST":
                body = event["body"]
                ldebug(f"Parsing body: '{body}'")
                payload = json.loads(body)
                code, result = modify_record(payload)
            elif method == "GET":
                params = event.get("queryStringParameters", None)
                code, result = get_record(params)
            elif method == "PUT":
                params = event.get("queryStringParameters", None)
                code, result = modify_record(params)
            elif method == "DELETE":
                params = event.get("queryStringParameters", None)
                code, result = delete_record(params)
        else:
            # Lambda call doesn't have an HTTP Method, so we assume it came here via IOT rule.
            #
            code, result = process_as_iot_request(event)


    except Exception as e:
        print(traceback.format_exc())
        payload = {"status": "error", "message": str(e)}
        result = json.dumps(payload)
        code = 500

    # response_headers = {
    #     'Content-Type': 'application/json'
    # }

    response = {
        "isBase64Encoded": False,
        "headers": return_response_headers(method),
        "statusCode": code,
        "body": result
    }

    return response
