# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# Common base for all subsystem makefiles.
#

PWD ?= pwd_unknown
BASE_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
BUILD_DIR := $(SELF_DIR)build
UTIL_DIR := $(SELF_DIR)util
#$(info BUILD_DIR is [${BUILD_DIR}])

CDK_PROJECT_NAME := iotcdk
INPUT_CONF_FILE := iotconfig.json
OUTPUT_CONF_FILE := iotcdkout.json
OUTPUT_CONF_SAVE_FILE := iotmergedconfig.json
BOOTSTRAP_CONF_FILE := iotbootstrap.json
BOOTSTRAP_CONF_PATH := $(BUILD_DIR)/$(BOOTSTRAP_CONF_FILE)
INPUT_CONF_PATH := $(BASE_DIR)$(INPUT_CONF_FILE)
OUTPUT_CONF_PATH := $(BUILD_DIR)/$(OUTPUT_CONF_FILE)
OUTPUT_CONF_SAVE_PATH := $(BUILD_DIR)/$(OUTPUT_CONF_SAVE_FILE)
#$(info INPUT_CONF_PATH is [${INPUT_CONF_PATH}])
#$(info OUTPUT_CONF_PATH is [${OUTPUT_CONF_PATH}])

$(info BOOTSTRAP_CONF_PATH is [${BOOTSTRAP_CONF_PATH}])

# This parses the bootstrap config file. The file is assumed to be a JSON with
# a single-level of key/values.
#
# Invoke it as:
# export VALUE ?= $(call FromBootstrapCfg,key)
#
define FromBootstrapConf
  $(shell node util/getconfig.js $(BOOTSTRAP_CONF_PATH) $(1))
endef

# This parses the input config file. The file is assumed to be a JSON with
# a single-level of key/values.
#
# Invoke it as:
# export VALUE ?= $(call FromInCfg,key)
#
define FromInConf
$(shell node -p "require('$(INPUT_CONF_PATH)').$(1)")
endef

# This parses the output file generated after a CDK build is run.
# This has two levels, a first which is a key with the stack-name
# and a second level with all the values. We will essentially
# hard-code that first level, so if CDK project name changes
# it should be replaced here.
#
# Invoke it as:
# export VALUE ?= $(call FromOutCfg,key)
#
define FromOutConf
$(shell node -p "require('$(OUTPUT_CONF_PATH)').$(CDK_PROJECT_NAME).$(1)")
endef
