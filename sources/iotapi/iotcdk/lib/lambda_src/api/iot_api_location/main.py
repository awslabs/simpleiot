# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: Location
# iot_api_location
#
# Locations are physical places where device instances are placed. For example, a list
# of devices may be all installed in a single store or office building.
# This API allows for CRUD operations on a location.
#
# It will also be possible to get a list of devices based on their location assignment
# from the Device API.
#

import json
from pony.orm import *
from iotapp.dbschema import *
from iotapp.dbutil import *
from iotapp.utils import *
from iotapp.logger import *
import uuid
import os
import traceback


connect_database()

def format_one(rec):

    return_data = {
        "id": rec.id.hex,
        "name": rec.name,
        "address": rec.address,
        "desc": rec.desc,
        "geo_lat": rec.geo_lat,
        "geo_lng": rec.geo_lng,
        "geo_alt": rec.geo_alt,
        "image_url": rec.image_url,
        "bg_url": rec.bg_url,
        "indoor_map_url": rec.indoor_map_url
    }

    if rec.date_created:
        return_data['date_created'] = rec.date_created.isoformat()
    if rec.last_modified:
        return_data['last_modified'] = rec.last_modified.isoformat()
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


def geocode_for_address(name, desc, address):
    lat = 0.0
    lng = 0.0

    try:
        client = boto3.client('location')
        response = client.create_place_index(DataSource='Esri',
                                             DataSourceConfiguration={'IntendedUse': 'Storage'},
                                             Description=desc,
                                             IndexName=name,
                                             PricingPlan="RequestBasedUsage"
                                             )
        response = client.search_place_index_for_text(IndexName=name,
                                                      Text=address)
        # ldebug(f"Geocode result: {json.dumps(response, indent=2)}")
        if len(response['Results']) > 0:
            first = response['Results'][0]
            place = first["Place"]
            geometry = place['Geometry']
            point = geometry['Point']
            lng = point[0]
            lat = point[1]
            ldebug(f"Got lat: {lat} - lng: {lng}")
    except Exception as e:
        ldebug(f"ERROR: exception on creating location index: {str(e)}")
        pass

    return lat, lng


def recreate_geo_index(name, new_name):
    try:
        client = boto3.client('location')
        client.delete_place_index(IndexName=name)
        response = client.create_place_index(DataSource='Esri',
                                         DataSourceConfiguration={'IntendedUse': 'Storage'},
                                         IndexName=new_name,
                                         PricingPlan="RequestBasedUsage"
                                         )
    except Exception as e:
        ldebug(f"ERROR: exception on creating location index: {str(e)}")
        pass

def recreate_geocode(name, address):
    lat = 0.0
    lng = 0.0

    try:
        client = boto3.client('location')
        response = client.search_place_index_for_text(IndexName=name,
                                                      Text=address)
        # ldebug(f"Re-create Geocode result: {json.dumps(response, indent=2)}")
        if len(response['Results']) > 0:
            first = response['Results'][0]
            place = first["Place"]
            geometry = place['Geometry']
            point = geometry['Point']
            lng = point[0]
            lat = point[1]
            ldebug(f"Got lat: {lat} - lng: {lng}")
    except Exception as e:
        ldebug(f"ERROR: exception on re-creating location index: {str(e)}")
        pass

    return lat, lng

def delete_geocode_index(name):
    try:
        client = boto3.client('location')
        client.delete_place_index(IndexName=name)
    except Exception as e:
        ldebug(f"ERROR: exception on deleting location index: {str(e)}")
        pass


@db_session
def add_record(params):
    code = 200
    result = {}
    location = None
    geo_lat = 0.0
    geo_lng = 0.0
    geo_alt = 0.0

    try:
        name = params.get("name", None)
        if name:
            desc = params.get("desc", "")
            geo_lat = float(params.get("geo_lat", "0.0"))
            geo_lng = float(params.get("geo_lng", "0.0"))
            geo_alt = float(params.get("geo_alt", "0.0"))
            address = params.get("address", "")
            image_url = params.get("image_url", "")
            bg_url = params.get("bg_url", "")
            indoor_map_url = params.get("indoor_map_url", "")

            if address and not (geo_lat or geo_lng):
                geo_lat, geo_lng = geocode_for_address(name, desc, address)

            location = Location(name=name,
                                desc=desc,
                                geo_lat=geo_lat,
                                geo_lng=geo_lng,
                                geo_alt=geo_alt,
                                address=address,
                                image_url=image_url,
                                bg_url=bg_url,
                                indoor_map_url=indoor_map_url)
            commit()


            result = {"status": "ok", "id": location.id.hex}
        else:
            code = 418
            result = {"status": "error", "message": "Location name missing."}
    except pony.orm.core.TransactionIntegrityError as e:
        lerror(f"Error adding Location: {str(e)}")
        code = 409
        result = {"status": "error", "message": f"Location '{name}' already exists"}

    except Exception as e:
        lerror(f"Error creating Location: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


def find_location(params):
    location = None

    location_name = params.get("name", None)
    if location_name:
        ldebug(f"Getting location with name: {location_name}")
        location = Location.get(name=location_name)
    else:
        location_id = params.get("id", None)
        if location_id:
            ldebug(f"Getting location with ID: {location_id}")
            location_guid = uuid.UUID(location_id)
            location = Location.get(id=location_guid)
    return location


@db_session
def get_record(params):
    """
    Called with the GET REST call to retrieve one or more records.
    :param params:
    :return:
    """

    code = 200
    result = {}

    try:
        if params:
            if params.get("all", None):
                all_locations = Location.select().order_by(Location.name)
                code = 200
                result = format_all(all_locations)
            else:
                one_location = find_location(params)
                if one_location:
                    code = 200
                    result = format_one(one_location)
                else:
                    code = 418
                    result = {"status": "error",
                              "message": f"Can not find Location"}
    except Exception as e:
        lerror(f"Error getting Location: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    ldebug(f"Returning result: {result}")
    return code, json.dumps(result)


@db_session
def modify_record(params):
    """
    Called with the PUT REST call to modify an existing record. NOTE that we are going to sanity check
    the params, as well as make sure no devices of this type exist for certain types of changes. If so,
    the error message will have to indicate that this field can not be changed.
    :param params:
    :return:
    """
    code = 200
    result = {}
    updates = {}
    delete_geo_index = False
    re_geocode = False

    try:
        location = find_location(params)
        if location:
            new_name = params.get("new_name", None)
            if new_name:
                updates['name'] = new_name
                delete_geo_index = True

            desc = params.get("desc", None)
            if desc:
                updates['desc'] = desc

            address = params.get("address", None)
            if address:
                updates['address'] = address
                re_geocode = True

            image_url = params.get("image_url", None)
            if image_url:
                updates['image_url'] = image_url

            bg_url = params.get("bg_url", None)
            if bg_url:
                updates['bg_url'] = bg_url

            indoor_map_url = params.get("indoor_map_url", None)
            if indoor_map_url:
                updates['indoor_map_url'] = indoor_map_url

            # We ignore it if lat/lngs are not proper floating numbers
            #
            geo_lat_str = params.get("geo_lat", None)
            if geo_lat_str:
                try:
                    updates['geo_lat'] = float(geo_lat_str)
                except Exception as e:
                    pass

            geo_lng_str = params.get("geo_lng", None)
            if geo_lng_str:
                try:
                    updates['geo_lng'] = float(geo_lng_str)
                except Exception as e:
                    pass

            geo_alt_str = params.get("geo_alt", None)
            if geo_alt_str:
                try:
                    updates['geo_alt'] = float(geo_alt_str)
                except Exception as e:
                    pass

            ldebug(f"Updating Location with data: {str(updates)}")
            location.set(**updates)
            commit()

            if delete_geo_index:
                recreate_geo_index(name, new_name)
                ldebug(f"Location renamed from {name} to {new_name}")

            if re_geocode:
                lat, lng = recreate_geocode(name, address)
                ldebug(f"Got new location data from geocode service. lat: {lat} lng: {lng}")
                location.geo_lat = lat
                location.geo_lng = lng
                commit()

            code = 200
            result = {"status": "ok", "id": location.id.hex}
        else:
            code = 418
            result = {"status": "error",
                      "message": f"Can not find Location"}

    except Exception as e:
        lerror(f"Error modifying Model: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}
        traceback.print_exc()

    return code, json.dumps(result)


@db_session
def delete_record(params):
    """
    Called with the DELETE REST call to remove a record.

    :param params:
    :return:
    """
    code = 200
    result = {}
    try:
        location = find_location(params)
        if location:
            location_id = location.id.hex
            location_name = location.name
            location.delete()
            commit()
            ldebug(f"Location record for '{location_name}' deleted")
            delete_geocode_index(location_name)
            ldebug(f"Deleted geocode index for '{location_name}'")
            result = {"status": "ok", "id": location_id}
            code = 200
        else:
            code = 418
            result = {"status": "error", "message": "Location record not found"}
    except Exception as e:
        lerror(f"Error deleting Location: {str(e)}")
        code = 500
        result = {"status": "error", "message": str(e)}

    return code, json.dumps(result)


def lambda_handler(event, context):
    result = ""
    code = 200
    method = ""

    try:
        method = event["httpMethod"]

        if method == "POST":
            body = event["body"]
            payload = json.loads(body)
            code, result = add_record(payload)
        elif method == "GET":
            params = event.get("queryStringParameters", None)
            code, result = get_record(params)
        elif method == "PUT":
            params = event.get("queryStringParameters", None)
            code, result = modify_record(params)
        elif method == "DELETE":
            params = event.get("queryStringParameters", None)
            code, result = delete_record(params)

    except Exception as e:
        payload = {"status": "error", "message": str(e)}
        result = json.dumps(payload)
        code = 500

    response = {
        "isBase64Encoded": False,
        "headers": return_response_headers(method),
        "statusCode": code,
        "body": result
    }

    return response
