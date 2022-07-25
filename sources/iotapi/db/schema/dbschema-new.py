# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# SimpleIOT: App Layer: Database Schema
# dbschema.py
#

from pony.orm import *
from datetime import datetime
import uuid
from enum import Enum, unique, IntFlag
from .dbutil import *


# DB definitions for the simpleiot project. It takes extra care and feeding
# not to break things with PonyORM if we use subclasses or break schema into
# separate files. So we just keep it all in one place.
#
# Also, there's a standard set of 5 fields present in all classes (id, name,
# desc, date_created, last_modified).
#
# Tried to put them in a common subclass and also a mix-in class. None of them
# worked without extra tweaking and fiddly flags. In the interest of moving
# along, just keeping it all here and with replicated fields.
#
db = Database()
#sql_debug(True)

#############################################################################
#
class BuildTool(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Customer(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Required(str)
    desc = Optional(str)
    address = Optional(str)
    contact_name = Optional(str)
    contact_email = Optional(str)
    contact_phone = Optional(str)
    image_url = Optional(str)
    bg_url = Optional(str)
#    customer_location = Set("Location", reverse="customer")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# A Data is a single recorded data attached to each device. Here we maintain
# only the latest value stored. Essentially the same as a device shadow,
# except maitained in the database.
#
class Data(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    udi = Optional(str, unique=True)
    value = Optional(str)
    type = Required("DataType", reverse="device_data")
    position = Optional(str)    # Optional combo lat/long/alt
    dimension = Optional(str)   # dimension (unindexed data)
    device = Required("Device")
    timestamp = Required(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# This is used to define each sensor or value type. An optional set of
# co-ordinates can be specified that would be mapped onto the Digital Twin
# 3D model. NOTE: we use the ID for the 'slot' position in the 3D viewer.
# NOTE: the names should be unique for each model, but not across the
# whole table. For example, two models may have the name 'temperature'
# one for each model. If we mark them as unique=True, adding the second
# temperature will issue an error, even if it's for a second model.
#
class DataType(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    udi = Optional(str, unique=True)
    name = Required(str)
    desc = Optional(str)

    # This data type is supported by these models. Note: many-to-many
    #
    model = Optional("Model", reverse="data_types", volatile=True)
    device_data = Set("Data", reverse="type", cascade_delete=True)

    # Values can be string or list of valid options.
    #
    data_type = Optional(str)
    units = Optional(str)
    allow_modify = Optional(bool, default=True)

    # If marked as show_on_twin, the data will be placed on the digital twin.
    #
    show_on_twin = Optional(bool, default=False)
    twin_records = Set("DigitalTwinRecords", reverse="datatype")

    #
    # The content of the label/notation for this point is defaulted (in code)
    # to be "{name}: {value}" - this allows the template to be overridden.
    # The value is formatted using standard python format-string notation.
    # Label colors are determined by 'levels' defined below.
    #
    # Example:
    # geodata = {'lat':57.123,'long':-120.028}
    # print('{lat}:{long}'.format(**geodata))
    #
    label_template = Optional(str)

    #
    # ViewMapper settings.
    # Levels is a JSON determining how the data is to be partitioned
    # and formatted. It assumes the data is an int or float type.
    # Format is:
    # name: name assigned to the range. May be shown
    # color: CSS color name or hex value returned when when_in method is called.
    # low: lower end of the range
    # high: upper end of the range
    # audio: URL of audio clip to play when range is triggered.
    # when_in: (optional) name of function called when a change value is inside the range.
    # when_below: (optional) name of function called when a change value falls below the range.
    #   This is called only once when the number was inside the range and has now fallen out.
    #   Passes the old value, the new value, and the color specified.
    # when_above: (optional) like when_below, except when value falls greater than the high level.
    # NOTE: It is recommended to make sure the ranges not overlap.
    #
    # NOTE 2: We may want to change it so we can also handle booleans (different colors/calls
    # for true/false, as well as items defined for a range of enum string values.
    #
    #
    # [
    #     {
    #         "name": "Good",
    #         "low": 50,
    #         "high": 100,
    #         "color": "green",
    #         "when_in": "name of function",
    #         "when_below": "name of function",
    #         "when_above": "name of function"
    #     },
    #     {
    #         "name": "Warning",
    #         "low": 10,
    #         "high": 49,
    #         "color": "yellow",
    #         "when_in": "name of function",
    #         "when_below": "name of function",
    #         "when_above": "name of function"
    #     },
    #     {
    #         "name": "Error",
    #         "low": 0,
    #         "high": 9,
    #         "color": "red",
    #         "audio": "https://..../awooga.mp3",
    #         "when_in": "name of function",
    #         "when_below": "name of function",
    #         "when_above": "name of function"
    #     }
    # ]
    #
    ranges = Optional(LongStr)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Device(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    serial_number = Required(str)
    udi = Optional(str, unique=True)
    device_project = Required("Project", reverse="devices")
    model = Required("Model", reverse="devices")
    name = Optional(str)
    desc = Optional(str)
    status = Optional(str)	# device-specific, including power-up, OK, etc.

    # These will be populated if the Model indicates that this is either an
    # IOT Thing or an IOT Greengrass device
    #
    # settings for IOT Things and Greengrass json (note: LongStr > 255 chars)
    iot_config_data = Optional(LongStr, default="", lazy=False) # If set to lazy, before_delete fails
    device_ca_data = Optional(LongStr, default="")
    device_cert_data = Optional(LongStr, default="")
    device_public_key_data = Optional(LongStr, default="")
    device_private_key_data = Optional(LongStr, default="")

    error_message = Optional(str)   # last error message
    date_manufactured = Optional(datetime, default=datetime.utcnow)
    manufacturer_extra_data = Optional(str)
    data = Set("Data", reverse="device")
    installed = Optional(bool, default=False)
    location = Optional("Location")
    position = Optional(str)      	# position string, ie: Floor 3, Office 200, or Front Bedroom.
    geo_lat = Optional(float)       # Current lat/long/altitude for indoor mapping and/or tracking
    geo_lng = Optional(float)
    geo_alt = Optional(float)
    is_gateway = Optional(bool, default=False) # copy of Model type field. Here so cascading deletes work.
    on_power = Optional(bool)   # true if plugged in
    battery_level = Optional(float)
    firmware_version = Optional(str)    # current firmware version
    firmwares = Set("Firmware", reverse="device")  # list of firmware versions for this device
    groups = Set("DeviceGroup", reverse="devices")
    tags = Set("DeviceTag", reverse="device")

    # Each device can have a single gateway. A device that is a gateway then maintains a list of its
    # own devices that have been attached to it.
    #
    gateway = Optional("Device", reverse="devices")
    devices = Set("Device", reverse="gateway")  # a device can be assigned to another device (aka gateway)

    # Many-to-many list of devices and update session records associated with each device.
    #
    update_sessions = Set("UpdateSession", reverse="devices")
    update_targets = Set("UpdateTarget", reverse="device")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

    # This hook is called before a record is deleted. It cleans up any IOT
    # related items if attached at the Model level. We need to pass along
    # whether this is a gateway or a thing. We're checking it here so
    # dbutil.py doesn't force a circular dependency on ModelType enum.
    #
    def before_delete(self):
        print("Start Device before_delete")
        if self.iot_config_data:
            print(f"Deleting Device iot")
            delete_iot_if_needed(self.iot_config_data, self.is_gateway)
            print(f"Device iot deleted")

        print(f"End Device before_delete")

#############################################################################
# DeviceGroups are static device clusterings with optional list of devices.
# Device
#
class DeviceGroup(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)
    devices = Set("Device", reverse="groups")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# DeviceSmartGroups are dynamic device filters that resolve by matching tags
# or attributes for each device. The smart group consists of one or more
# conditionals that are matched. If a device passes the conditionals, it is
# added to the DeviceSmartGroup and functions can be applied to it. For example,
# a firmware update can be sent to a smart list and only those devices will be
# targeted for update.
#
# The predicate is a string that matches the predicates defined in PyPred
# (https://github.com/armon/pypred) which can be looked up at runtime
# against the list of all devices. We only check the predicates against the
# tags defined for each device.
#
# Eventually, we may want to provide a visual predicate builder that translates
# into PyPred syntax.
#
class DeviceSmartGroup(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    predicate = Optional(LongStr)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# DeviceTags are arbitrary tags associated with each device instance.
# These can be used to filter an obtain a list of devices. DeviceSmartGroups
# use these to filter out all devices that match certain criteria.
#
# The relationship is one-to-many, so each device can have multiple tags
# but each tag can be associated with only one device.
#
# A tag must have a name, but can also have an arbitrary string value associated
# with it. This way you can filter on, say, all devices that are "installed"
# as well as all devices with "color == blue" or "location == Berkeley."
#
class DeviceTag(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str)
    value = Optional(str)
    device = Required("Device", reverse="tags")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
# NOTE: enums are supported in Python 3

@unique
class ModelType(Enum):
    NONE = 0         # Exclude from IOT
    DEVICE = 1       # It's a device (i.e. a Thing)
    GATEWAY = 2      # i.e. gateway (i.e. a Greengrass core)
    MOBILE = 3       # It represents a mobile device

@unique
class ModelSecurity(Enum):
    NONE = 0        # Don't generate a unique cert for device (or it maintains its own)
    DEVICE = 1      # Generate a cert for each individual device
    MODEL = 2       # Generate a cert for each Model

@unique
class ModelStorage(IntFlag):
    NONE = 0        # Device doesn't have any local storage
    DEVICE = 1 << 0      # Device has local storage
    GATEWAY = 1 << 1     # Data is stored on gateway
    CLOUD = 1 << 2       # Data is stored on cloud
    MOBILE = 1 << 3      # Data is stored on mobile

# Bit fields for protocol types. Can be ORed together if supporting more than one.
@unique
class ModelProtocol(IntFlag):
    TCP = 1 << 0
    UDP = 1 << 1
    IP = 1 << 2
    MQTT = 1 << 3
    COAP = 1 << 4
    AMQP = 1 << 5
    XMPP = 1 << 6
    DDS = 1 << 7
    LWM2M = 1 << 8
    BLUETOOTH = 1 << 9
    BLE = 1 << 10
    LORA = 1 << 11
    ZIGBEE = 1 << 12
    ZWAVE = 1 << 13
    NFC = 1 << 14
    CANBUS = 1 << 15
    LTE = 1 << 16
    NBIOT = 1 << 17
    LTE_M = 1 << 18
    THREAD = 1 << 19

@unique
class ModelConnection(Enum):
    NONE = 0       # No direct connection - goes some other way
    DIRECT = 1     # MQTT to cloud
    GATEWAY = 2    # via a gateway (greengrass)
    MOBILE = 3     # via a mobile app

# Machine learning. Can be ORed together if supporting multiples
@unique
class ModelML(IntFlag):
    NONE = 0       # No on-board ML
    DEVICE = 1 << 0     # ML work is done on the device itself
    GATEWAY = 1 << 1    # ML work is done on the gateway
    MOBILE = 1 << 2     # ML work is done on the mobile app
    CLOUD = 1 << 3      # ML work is done on the cloud

#### Provisioning -- these are various ways to indicate how a device is going to get
#
# provisioned. It's set up at the Model level. These are pre-defined here as placeholders
# but most of the flows are awaiting customer-required implementation.
#
#######
#
# ProvisionLocation indicates where the device will be provisioned before installation.
# Provisioning typically involves registration, setting configuration data, adding network
# credentials, or indicating installation location. For now, it's all wrapped into one
# step, but in the future it could be expanded to multiple steps.
#
class ProvisionLocation(IntFlag):
    NONE = 0            # No provisioning needed
    MANUFACTURING = 1   # At manufacturer location
    THREEPL = 2         # At the 3PL
    WAREHOUSE = 3
    HQ = 4
    CUSTOMER = 5        # on-site at customer/user location
    REMOTE = 6          # Done via remote messaging

#
# This flags who will be doing the provisioning
#
class ProvisionBy(IntFlag):
    NONE = 0
    CUSTOMER = 1
    DESIGNER = 2
    MANUFACTURER = 3
    THREEPL = 4
    INSTALLER = 5
    MAINTAINER = 6
#
# How the device will be provisioned
#
class ProvisionVia(IntFlag):
    NONE = 0
    ONDEVICE = 1
    FLASH = 2
    SIM = 3
    SDCARD = 4
    RESTAPI = 5
    MOBILE = 6
    BLE = 7
    UWB = 8
    NFC = 9
    WIFI = 10
    AUDIO = 11
    WEB = 12
    APP = 13
    EMAIL = 14
    SMS = 15

#
# Provision Flow captures what kind of provisioning will be done for each model.
# Embedded means provisioning data is embedded inside firmware.
#
class ProvisionFlow(IntFlag):
    NONE = 0
    EMBEDDED = 1
    API = 2
    CLAIM = 3
    TPM = 4
    MOBILE = 5
    SMS = 6

############
# OTA update notifications
#
# These indicate how OTA updates are sent via push. Default is via MQTT.
# However, we can also send via SMS if Pinpoint is enabled in the installer.
#
class UpdatePushVia(IntFlag):
    NONE = 0
    MQTT = 1
    WEBSOCKET = 2
    SMS = 3
    BLE = 4

#
# Model names are not marked as unique so models can have same name across different projects.
# We manually do duplicate name checking when a Model is added to a project. We could also create a
# composite key, but there were reports of issues with some engine back-ends, so this was deemed
# safer.

class Model(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    udi = Optional(str, unique=True)
    name = Optional(str, unique=False)
    desc = Optional(str)
    model_project = Required("Project", volatile=True, reverse="models")
    # Devices are manually deleted in case they have attached certificates and IOT Things
    devices = Set("Device", reverse="model", cascade_delete=True)
    data_types = Set("DataType", reverse="model", volatile=True, cascade_delete=True)
    revision = Optional(str)
    display_name = Optional(str)
    display_order = Optional(int)
    image_url = Optional(str)
    icon_url = Optional(str)
    has_digital_twin = Optional(bool, default=False) # Set to True if device is going to have a 3D Digital Twin
    has_location_tracking = Optional(bool, default=False) # Set to True if device is going to have location tracking
    has_alexa = Optional(bool, default=False)   # Set to True if device is going to have Alexa query support
    requires_power = Optional(bool, default=False)
    requires_battery = Optional(bool, default=True)
    tracker_name = Optional(str)
    digital_twins = Set("DigitalTwin", reverse="model")

    # If certs are to be associated with a model, this is where they would be stored.
    # They will be created lazily only when the first instance of a device of this model
    # type is created. When deleting a Model, we must be careful to delete the certs
    # and policies to clean up after ourselves.
    #
    iot_config_data = Optional(LongStr, default="", lazy=False) # If set to lazy, before_delete fails
    model_ca_data = Optional(LongStr, default="")
    model_cert_data = Optional(LongStr, default="")
    model_public_key_data = Optional(LongStr, default="")
    model_private_key_data = Optional(LongStr, default="")

    # These attributes indicate whether a device is installed in a fixed spot or can be moved.
    # If movable, the Data attributes will be (if available) tagged with GPS location data
    #
    # If marked as movable, recommend also specifying that data should also be sent to
    # Timestream database. If sent to Timestream, data can be visualized using Grafana dashboard.
    #
    moveable = Optional(bool, default=False)
    wearable = Optional(bool, default=False)
    in_datalake = Optional(bool, default=False) # set to true to save data to data lake
    data_log = Optional(bool, default=False) # if true, Data will be sent to Timestream
    require_position = Optional(bool, default=False)

    hw_version = Optional(str)
    firmware_version = Optional(str)        # current firmware version for this model
    firmwares = Set("Firmware", reverse="model")  # list of firmware versions for this model

    model_type = Optional(int, default=ModelType.DEVICE.value)
    model_security = Optional(int, default=ModelSecurity.DEVICE.value)
    model_storage = Optional(int, default=ModelStorage.NONE.value)
    model_protocol = Optional(int, default=ModelProtocol.MQTT.value)
    model_connection = Optional(int, default=ModelConnection.DIRECT.value)
    model_ml = Optional(int, default=ModelML.NONE.value)

    # Provisioning flags - defaults are NONE for everything
    #
    provision_location = Optional(int, default=ProvisionLocation.NONE.value)
    provision_by = Optional(int, default=ProvisionBy.NONE.value)
    provision_via = Optional(int, default=ProvisionVia.NONE.value)
    provision_flow = Optional(int, default=ProvisionFlow.NONE.value)

    # OTA push notification method
    update_push_via = Optional(int, default=UpdatePushVia.MQTT.value)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

    # This hook is called before a record is deleted. I cleans up any IOT
    # related items if attached at the Model level. We need to pass along
    # whether this is a gateway or a thing. We're checking it here so
    # dbutil.py doesn't force a circular dependency on ModelType enum.
    #
    def before_delete(self):
        #print("Start Model before_delete")
        if self.iot_config_data:
            #print(f"Deleting Model iot")
            is_gateway = self.model_type is ModelType.GATEWAY
            delete_iot_if_needed(self.iot_config_data, is_gateway)
            #print(f"Model iot deleted")

        #print(f"End Model before_delete")

#############################################################################
#
class Diagnostic(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class DiagRecord(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# A DigitalTwin record captures an instance of a twin that can be visualized in
# 3D and Augmented Reality. There can be multiple Digital Twins and they can
# all be associated with a single Model. You can toggle between different twins
# to get different 'slices' or views, or to have multiple versions.
# One digital twin can be marked as the 'default' which will be returned
# if a twin is not explicitly specified.
#
# Each Twin may have one or more TwinRecord objects. These are 3D points on
# the twin and are associated with DataTypes belonging to that Model.
# These indicate where to put the labels on the twin.
#

@unique
class DigitalTwinState(Enum):
    NONE = 0
    INIT = 1
    READY = 2


class DigitalTwin(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    #
    # these should be unique for each model but we don't want to assert it at the
    # table level since there can be collisions for twins assigned to different models.
    #
    name = Optional(str, default="DigitalTwin")
    desc = Optional(str)
    state = Optional(int, default=DigitalTwinState.NONE.value)
    is_default = Optional(bool, default=False)
    model = Optional("Model", reverse="digital_twins")
    records = Set("DigitalTwinRecord", reverse="digital_twin")

    twin3d_model_url = Optional(str) # URL to Digital Twin representation of object in GLB, GLTF, or USDZ format
    md5_hash = Optional(str)
    env_img_url = Optional(str)     # URL for environment in circular .hdr file.
    sky_box_url = Optional(str)     # URL for Skybox image in circular .hdr file.

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# These each indicate where on a Twin the marker should be placed. They map
# Datatypes to the Twin
#
class DigitalTwinRecord(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    digital_twin = Required("DigitalTwin", reverse="records")
    datatype = Optional("DataType", reverse="twin_records")

    # These are passed on to the ModelViewer component, to mark the
    # location of the annotation. NOTE that this is set per DataType
    # which means the location has to be the same on every device instance.
    # The contents of the notation. Format is #, #, # (where # is a floating coordinate)
    #
    data_position = Optional(str)
    data_normal = Optional(str)

    #
    # NOTE: we should be able to add style information to each one, also
    # hints on how they could be modified (for example with a slider, a text field,
    # a rotary knob, etc.)
    #
    display_type = Optional(int)
    input_type = Optional(int)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Feature(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class FeatureSet(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# A Generator is a source code/firmware generator module. It defines
# what is available for which platform and device.
#
# A generator defines what's available and points to a zip archive where the
# code for the generator is stored.
#
# List of common microcontroller manufacturers:
# https://en.wikipedia.org/wiki/List_of_common_microcontrollers
#
class GeneratorManufacturer(Enum):
    ANY = 0        # device agnostic or no device specified
    ALTERA = 1
    ANALOGDEVICS = 2
    ATMEL = 3
    CYPRESS = 4
    ELAN = 5
    EPSON = 6
    ESPRESSIF = 7
    FREESCALE = 8
    FUJITSU = 9
    HOLTEK = 10
    HYPERSTONE = 11
    INFINEON = 12
    INTEL = 13
    LATTICE = 14
    MAXIM = 15
    MICROCHIP = 16
    NATIONALSEMI = 17
    NEC = 18
    NXP = 19
    NUVOTON = 20
    PANASONIC = 21
    PARALLAX = 22
    RABBIT = 23
    RENESAS = 24
    REDPINE = 25
    ROCKWELL = 26
    SILICONLABS = 27
    SILABS = 27
    SILICONMOTION = 28
    SONY = 29
    SPANSION = 30
    ST = 31
    STMICRO = 31
    TEXASINSTRUMENTS = 32
    TI = 32
    TOSHIBA = 33
    UBICOM = 34
    XEMICS = 35
    XILINX = 36
    XMOS = 37
    ZILOG = 38


class GeneratorProcessor(Enum):
    NONE = 0
    ESP32 = 1
# List to follow

# From: https://www.osrtos.com/
class GeneratorOS(Enum):
    NONE = 0
    ARDUINO = 1
    NUTTX = 2
    MYNEWT = 3
    TENCENTOS = 4
    TRAMPOLINE = 5
    QUARKTS = 6
    PHOENIX = 7
    AZURERTOS = 8
    THREADX = 8
    NUTOS = 9
    ZEPHYR = 10
    FREERTOS = 11
    AMAZON_FREERTOS = 12
    MBEDOS = 13
    EMBOX = 14
    RIOT = 15
    CHIBIOS = 16
    DUINOS = 17
    STATEOS = 18
    INTROS = 19
    MICROC_OSII = 20
    MICROC_OSIII = 21
    TINYOS = 22
    CONTIKI = 23
    CONTIKI_NG = 24
    RT_THREAD = 25
    DRONE = 26
    TOCK = 27
    ALIOS = 28
    MONGOOSE = 29
    F9 = 30
    TIZENRT = 31
    SEL4 = 32
    ERIKA_ENTERPRISE = 33
    ERIKA = 33
    LITEOS = 34
    FROSTED = 35
    DISTORTOS = 36
    HYPERC = 37
    ECHRONOS = 38
    STRATIFYOS = 39
    BERTOS = 40
    XENOMAI = 41
    COCOOS = 42
    BRTOS = 43
    RTEMS = 44
    RTAI = 45
    LIBRERTOS = 46
    ATOMTHREADS = 47
    UKOS = 48
    MOE = 49
    ATK2 = 50
    TNEO = 51
    MARTE = 52
    BITTHUNDER = 53
    TIRTOS = 54
    SCMRTOS = 55
    MARK3 = 56
    FUSION = 57
    MQX = 58
    ECOS = 59
    TNKERNEL = 60
    FUNKOS = 61
    FEMTO = 62
    PREX = 63
    USMARTX = 64
    PROTOTHREADS = 65


class Generator(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)
    author = Optional(str)
    contact_email = Optional(str)
    icon_url = Optional(str)
    manufacturer = Optional(int, default=GeneratorManufacturer.ANY.value)
    processor = Optional(int, default=GeneratorProcessor.NONE.value)
    os = Optional(int, default=GeneratorOS.NONE.value)
    zip_s3_bucket = Optional(str)
    zip_s3_key = Optional(str)
    zip_url = Optional(str) # publicly accessible URL

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# A Firmware record is created each time a payload is uploaded. It is used
# to manage the metadata around each update. It does NOT include upload
# data such as which devices are going to get it, when it's rolled out,
# etc. Note that the payload can be anything, such as configuration file,
# scripts, etc.
#
# The information on the individual submission captured in an UpdateSession
# record.
#

@unique
class FirmwareState(Enum):
    NONE = 0
    INIT = 1
    READY = 2


class Firmware(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    state = Optional(int, default=FirmwareState.NONE.value)
    desc = Optional(str)
    submitted_by = Optional("User", reverse="firmware_submitted")
    model = Optional("Model", reverse="firmwares")
    device = Optional("Device", reverse="firmwares")
    update_sessions = Optional("UpdateSession", reverse="firmware")
    update_targets = Set("UpdateTarget", reverse="firmware")
    version = Required (str)		# fw version in semver format
    # set to true to have device ignore version check. Used to downgrade to a lower number.
    force_update = Optional(bool, default=False)
    release_note = Optional(LongStr)
    user_data = Optional(LongStr)   # Optional user-data passed along (could be JSON)
    payload_url = Optional(str)		# URL for payload
    md5_hash = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"


#############################################################################
#
class Location(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    address = Optional(str)
    desc = Optional(str)
    # customer = Required("Customer")
    device_location = Set("Device", reverse="location")

    # If specified, there's a physical 3D model for this location
    #
    twin3d_model_url = Optional(str) # URL to Digital Twin representation of object in GLB or GLTF format
    env_img_url = Optional(str)     # URL for environment in circular .hdr file.
    sky_box_url = Optional(str)     # URL for Skybox image in circular .hdr file.

    # Lat/long coordinates
    geo_lat = Optional(float)
    geo_lng = Optional(float)
    geo_alt = Optional(float)

    image_url = Optional(str)
    bg_url = Optional(str)
    indoor_map_url = Optional(str)      # used for indoor positioning

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Log(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class LogRecord(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Maintainer(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class MaintenanceTask(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Map(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# MediaFile represents any user-uploaded content that is tracked and can be publicly
# accessed. This could include data files, images, 3D models, audio, or video
# assets. Media records can have versions and references to each record will,
# by definition, be to a specific version.
#
# MediaFiles are also project-specific, and are kept in folders in S3.
# Additional meta-data may be associated with MediaFiles, including a JSON
# string that is stored with each file. Different subsystems may want to
# post-process the strings in any way they want.
#

class MediaFile(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    project = Required("Project", volatile=True, reverse="media_files")
    name = Optional(str) # Note: combination name and version should be unique.
    version = Optional(str)
    name_version = Optional(str, unique=True)
    desc = Optional(str)
    type = Optional(str)
    md5 = Optional(str)
    url = Optional(str) # public URL pointing to CloudFront distribution
    meta_data = Optional(LongStr, default="", lazy=False)
    s3_object_path = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Mobile(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"


#############################################################################
#
class Part(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Project(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)
    # Models are manually deleted, in case they have manual
    models = Set("Model", reverse="model_project", volatile=True, cascade_delete=True)
    users = Set("User", reverse="user_project")
    devices = Set("Device", reverse="device_project", cascade_delete=True)
    settings = Set("Setting")

    # If a model stores certificates at project level, this is where it's
    # stored. We keep the IOT attributes associated with it so they can be deleted
    # if defined at this level.
    #
    # NOTE: for production system, we will NOT want to store cert and key data in the
    # database. For development systems we do so other developers can access the cert
    # data and work on the same devices.
    #
    is_gateway = Optional(bool, default=False)  # copy of Model type field. Here so cascading deletes work.
    iot_config_data = Optional(LongStr, default="", lazy=False) # If set to lazy, before_delete fails
    project_ca_data = Optional(LongStr, default="")
    project_cert_data = Optional(LongStr, default="")
    project_public_key_data = Optional(LongStr, default="")
    project_private_key_data = Optional(LongStr, default="")

    media_files = Set("MediaFile", reverse="project", cascade_delete=True)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

    def before_delete(self):
        #print("Start Project before_delete")
        if self.iot_config_data:
            #print(f"Deleting Project iot")
            delete_iot_if_needed(self.iot_config_data, self.is_gateway)
            #print(f"Project iot deleted")

        #print(f"End Project before_delete")

#############################################################################
#
class Role(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)
    users = Set("User", reverse="roles")
    is_admin = Optional(bool, default=False)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# Settings are global settings for each project
#
class Setting(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Required(str, unique=True)
    value = Optional(str)
    desc = Optional(str)
    project = Required("Project")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class Simulator(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class SSH(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# SystemSettings are global settings for a single installation
#
class SystemSetting(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Required(str, unique=True)
    value = Optional(LongStr)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
# Templates are used to create skeleton projects of a given type.
#
@unique
class TemplateType(Enum):
    PROJECT = 0       # Project Template
    MDOEL = 1         # Model Template
    DATATYPE = 2      # DataType


class Template(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str)
    desc = Optional(str)
    type = Optional(int, default=TemplateType.PROJECT.value)
    icon_url = Optional(str)
    author = Optional(str)
    email = Optional(str)
    dev_url = Optional(str)
    license = Optional(str)
    zip_url = Optional(str)
    value = Optional(LongStr)   # Inline JSON description (optional)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"


#############################################################################
#
# When a firmware update is queued up, it needs a Firmware record and this
# mechanism captures the update session. Once an UpdateSession is created,
# it tracks what devices are targeted and what state they're in.
#
@unique
class UpdateState(Enum):
    NONE = 0
    ACTIVE = 1
    ERROR = 2
    CANCELLED = 3
    RECEIVED = 4
    INSTALLED = 5


class UpdateSession(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    state = Optional(int, default=UpdateState.NONE.value)
    name = Optional(str, default="Update Session")
    desc = Optional(str, default="")
    firmware = Optional("Firmware", "update_sessions") # connection to Firmware record
    condition = Optional(LongStr)
    devices = Set("Device", reverse="update_sessions")
    update_target = Set("UpdateTarget", reverse="session")

    release_date = Optional(datetime, default=datetime.utcnow)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
# Each UpdateTarget record matches a single update record. It is created
# for each individual device to track the update process for all candidates.
#
class UpdateTarget(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    state = Optional(int, default=UpdateState.NONE.value)
    firmware = Optional("Firmware", reverse="update_targets")
    device = Optional("Device", reverse="update_targets")
    session = Optional("UpdateSession", reverse="update_target")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class User(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)
    roles = Set("Role", reverse="users")
    user_project = Optional("Project", reverse="users")
    firmware_submitted = Set("Firmware", reverse="submitted_by")

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

#############################################################################
#
class UserSession(db.Entity):
    id = PrimaryKey(uuid.UUID, default=uuid.uuid4)
    name = Optional(str, unique=True)
    desc = Optional(str)

    date_created = Required(datetime, default=datetime.utcnow)
    last_modified = Optional(datetime, default=datetime.utcnow)

    def __repr__(self):
        return f"{self.__class__.__name__}: {self.name}"

