/*
 * © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved. 
 * 
 * These are AWS IOT credentials. This is for the SimpleIOT demo program.
 * Not for production use.
 */

#ifndef __SIMPLEIOT_SECRETS__
#define __SIMPLEIOT_SECRETS__

#include <pgmspace.h>

// Not really a secret, but all project-dependent values can be defined here.
//
#define SIMPLEIOT_IOT_ENDPOINT "{{ iot_endpoint }}"


// Root CA file
//
static const char SIMPLE_IOT_ROOT_CA[] PROGMEM = R"EOF(
{{ simpleiot_root_ca }}
)EOF";

// Device Certificate
//
static const char SIMPLE_IOT_DEVICE_CERT[] PROGMEM = R"KEY(
{{ simpleiot_device_cert }}
)KEY";

// Device Private Key
//
static const char SIMPLE_IOT_DEVICE_PRIVATE_KEY[] PROGMEM = R"KEY(
{{ simpleiot_private_key }}
)KEY";

#endif /* __SIMPLEIOT_SECRETS__ */
