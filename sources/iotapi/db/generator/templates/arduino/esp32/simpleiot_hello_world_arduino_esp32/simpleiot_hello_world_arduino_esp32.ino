/*
 * © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 * 
 * This is the basic "HelloWorld" example program used to demonstrate sending and receiving
 * values using the SimpleIOT library.
*/
#include <M5Core2.h>
#include <Wire.h>
#include <ArduinoJson.h>


#include "iot-secrets.h"  // NOTE: this contains the certs for the remote service
#include "wifi-settings.h" // and the local wifi-settings

#include "HelloDisplayUtils.hpp"
#include <SimpleIOT.h>

#define IOT_PROJECT "{{ project }}"
#define IOT_MODEL   "{{ model }}"
#define IOT_SERIAL  "{{ device }}"
#define IOT_FW_VERSION "{{ version }}"

int currentButton = 0;

 /* Singleton instance of SimpleIOT with the WIFI credentials and IOT endpoint value */

SimpleIOT* iot = NULL;

/* 
 *  This is a callback invoked when data comes from the cloud side. 
 */
void onDataFromCloud(SimpleIOT *iot, String name, String value, SimpleIOTType type)
{
  Serial.print(">>> Got data for: ");
  Serial.println(name);

  if (name.equalsIgnoreCase("color")) {
    if (value.equalsIgnoreCase("red")) {
      setCurrentColor(PLANET_RED);
    } else
    if (value.equalsIgnoreCase("green")) {
      setCurrentColor(PLANET_GREEN);
    } else
    if (value.equalsIgnoreCase("blue")) {
      setCurrentColor(PLANET_BLUE);
    } else
    if (value.equalsIgnoreCase("off")) {
        setCurrentColor(PLANET_ORIGINAL);
    }
    updateDisplay(currentButton);
  }
}

//////////////////////////////////////////////////////

void onConnectionReady(SimpleIOT *iot, int status, String message)
{
  Serial.print("SimpleIOT: ");
  Serial.print(message);

  showHelloWorldBackground();
}


/* NOTE
 * On the M5 Cores, do NOT call Serial.begin or Wire.begin. These are already called inside the 
 * M5.begin call and will freeze the device if called twice. The default Serial speed is 115200.
 * More info here: https://github.com/m5stack/m5-docs/blob/master/docs/en/api/system.md
*/
void setup() {
  M5.begin();
  showStartupScreen();

  /* 
   * Initialize and configure a SimpleIOT instance.
   */
  iot = SimpleIOT::create(WIFI_SSID, WIFI_PASSWORD, SIMPLEIOT_IOT_ENDPOINT, 
                          SIMPLE_IOT_ROOT_CA, SIMPLE_IOT_DEVICE_CERT, SIMPLE_IOT_DEVICE_PRIVATE_KEY);
  iot->config(IOT_PROJECT, IOT_MODEL, IOT_SERIAL, IOT_FW_VERSION, onConnectionReady, onDataFromCloud);

  Serial.println("Setup done");
}


void sendButton(int button) 
{
  iot->set("button", button);

  currentButton = button;
  updateDisplay(currentButton);
}

/*
 * Standard Arduino loop. We read the button values and send them down
 */
void loop() 
{
  if (M5.BtnA.wasPressed()) {
    sendButton(1);
  } else
  if (M5.BtnB.wasPressed()) {
    sendButton(2);
  } else
  if (M5.BtnC.wasPressed()) {
    sendButton(3);
  }

  M5.update();

  // NOTE: this needs to be called to let SimpleIOT and MQTT send and receive data. 
  // The delay is how many  milliseconds you want to wait between each call. 
  // A smaller number will yield more accurate delta values, but could overload the I2C bus.
  //
  iot->loop(100);
}
