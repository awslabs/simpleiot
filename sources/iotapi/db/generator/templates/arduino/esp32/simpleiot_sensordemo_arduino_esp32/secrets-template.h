/*
 * © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved. 
 * 
 * These are AWS IOT credentials. This is for the SimpleIOT demo program.
 * Not for production use.
 */

#include <pgmspace.h>

// Not really a secret, but all project-dependent values can be defined here.
//
#define SIMPLEIOT_IOT_ENDPOINT "*** specify IOT endpoint ***"

// These can be downloaded from IOT, renamed to .txt files then copy/pasted here.
//
// Root CA file
//
static const char SIMPLE_IOT_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----

{ *** copy paste here *** }

-----END CERTIFICATE-----
)EOF";

// Device Certificate
//
static const char SIMPLE_IOT_DEVICE_CERT[] PROGMEM = R"KEY(
-----BEGIN CERTIFICATE-----

{ *** copy paste here *** }

-----END CERTIFICATE-----
)KEY";

// Device Private Key
//
static const char SIMPLE_IOT_DEVICE_PRIVATE_KEY[] PROGMEM = R"KEY(
-----BEGIN RSA PRIVATE KEY-----

{ *** copy paste here *** }

-----END RSA PRIVATE KEY-----
)KEY";
