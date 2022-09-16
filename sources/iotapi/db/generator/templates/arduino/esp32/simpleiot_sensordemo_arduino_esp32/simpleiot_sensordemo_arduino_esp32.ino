/*
 * © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 * 
 * This is an example program that reads an M5Stack ENV-II device and a rotary knob
 * and sends the values to AWS IOT using the SimpleIOT library. It also accepts
 * and processes return commands via the 'color' parameter.
*/
#include <M5Core2.h>
#include <Wire.h>
#include <ArduinoJson.h>

#include "iot-secrets.h"  // NOTE: this contains the certs for the remote service
#include "wifi-settings.h" // and the local wifi-settings
#include <SimpleIOT.h>

//-----------------------------------------
// To be filled by template processor at runtime.
//
#define IOT_PROJECT "{{ project }}"
#define IOT_MODEL   "{{ model }}"
#define IOT_SERIAL  "{{ device }}"
#define IOT_FW_VERSION "{{ version }}"

//#define IOT_PROJECT "{{ project }}"
//#define IOT_MODEL   "{{ model }}"
//#define IOT_SERIAL  "{{ device }}"
//#define IOT_FW_VERSION "{{ version }}"

//-----------------------------------------
// Rotary encoder
//
#include "Unit_Encoder.h"

Unit_Encoder encoder;
signed short int last_encoder_value = 0;

//-----------------------------------------
// ENV-III environmental sensor
//
#include "M5_ENV.h"

SHT3X sht30;
QMP6988 qmp6988;
float last_temperature = 0.0;
float last_humidity = 0.0;
float last_pressure = 0.0;

// These are used to fit the values into the display and also to throttle how much data is sent to the cloud.
// The PRESSURE_OFFSET subtracts this much from the raw reading, and is only applicable to this one device.
//
// If the current reading exceeds the last value by the DELTA amounts, then we go ahead and send the data.
// Set these to 0.0 if you want every raw reading to go out.
//
#define PRESSURE_DIVISOR 10000
#define TEMP_DELTA 0.1
#define HUMIDITY_DELTA 1.0
#define PRESSURE_DELTA 2.0


//-----------------------------------------
// LED strips on the side
//
#include "FastLED.h"
#define LEDS_PIN 25
#define LEDS_NUM 10
CRGB ledsBuff[LEDS_NUM];

//-----------------------------------------
// GPS Unit
//
#include <TinyGPSPlus.h>
static const uint32_t GPSBaud = 9600;
TinyGPSPlus gps;
HardwareSerial ss(2);
float last_lat = 0.0;
float last_lng = 0.0;

//-----------------------------------------

// Number of secs to pause between scans of the sensors. The smaller the unit, the quicker the reaction time. But also 
// the more raw data that will be sent to the cloud.
//
#define SENSOR_SCAN_TIME_SECS 0.5

/* Singleton instance of SimpleIOT with the WIFI credentials and IOT endpoint value */

SimpleIOT* iot = NULL;


/* Variables to hold data read from the devices. The last_xxxx values are used
 *  to cache read values and only transmit them when the delta between the current
 *  reading the and the new value exceeds the XXX_DELTA settings.
 *  This is to prevent too much data (or duplicates of the same data getting sent out.
 *  This, obviously is very application-specific.
 */

#include "display_utility.hpp"


void initLedBar() 
{
  Serial.println(">> Initializing LEDs");
  FastLED.addLeds<SK6812, LEDS_PIN>(ledsBuff, LEDS_NUM);
  setLedColor(0, 0, 0);
}

void setLedColor(uint8_t r, uint8_t g, uint8_t b)
  {
    for (int i = 0; i < LEDS_NUM; i++) {
        ledsBuff[i].setRGB(g, r, b);
    }
    FastLED.show();
    yield();
  }

//////////////////////////////////////////////////////

void onConnectionReady(SimpleIOT *iot, int status, String message)
{
  Serial.print("SimpleIOT: ");
  Serial.print(message);
  hideConnecting();
  delay(100);
  yield();
  showConnected();
}

/* 
 *  This is a callback invoked when data comes from the cloud side. 
 */
void onDataFromCloud(SimpleIOT *iot, String name, String value, SimpleIOTType type)
{
  Serial.print("Got data for: ");
  Serial.println(name);

  if (name.equalsIgnoreCase("color")) {
    if (value.equalsIgnoreCase("red")) {
      setLedColor(255, 0, 0);
      Serial.println(F(">>>Set LED to RED"));
    } else
    if (value.equalsIgnoreCase("green")) {
      setLedColor(0, 255, 0);
      Serial.println(F(">>>Set LED to GREEN"));
    } else
    if (value.equalsIgnoreCase("blue")) {
      setLedColor(0, 0, 255);
      Serial.println(F(">>>Set LED to BLUE"));
    } else
    if (value.equalsIgnoreCase("off")) {
      setLedColor(0, 0, 0);
      Serial.println(F(">>>Set LED to OFF"));
    }
  }
}

/* NOTE NOTE NOTE
 * On the M5 Cores, do NOT call Serial.begin or Wire.begin. These are already called inside the 
 * M5.begin call and will freeze the device if called twice. The default Serial speed is 115200.
 * More info here: https://github.com/m5stack/m5-docs/blob/master/docs/en/api/system.md
*/
void setup() {

  Serial.println(F("SensorDemo: starting"));

  M5.begin(true, true, true, true);

  // Initialize all sensors
  //
  Serial.println(F("Encoder: init"));
  encoder.begin(&Wire, ENCODER_ADDR, 32, 33);   // rotary encoder
  Serial.println(F("Env-III: init"));
  qmp6988.init();    // environmental sensor
  Serial.println(F("GPS: init"));
  ss.begin(GPSBaud, SERIAL_8N1, 13, 14); // serial port to GPS

  // Per: https://community.m5stack.com/topic/2676/m5-lcd-setbrightness-not-working/2
  // On Core2, the setBrightness is capped. To get it full brightness you have to set 
  // the display voltage level from 2500 to 3300

  //M5.Lcd.setBrightness(128);
  M5.Axp.SetLcdVoltage(3300); 

  initLedBar();
  
  setupSprites();
  showStartupScreen();
  showFirmwareVersion(IOT_FW_VERSION);

  showConnecting();
  /* 
   * Initialize and configure a SimpleIOT instance.
   */
  iot = SimpleIOT::create(WIFI_SSID, WIFI_PASSWORD, SIMPLEIOT_IOT_ENDPOINT, 
                          SIMPLE_IOT_ROOT_CA, SIMPLE_IOT_DEVICE_CERT, SIMPLE_IOT_DEVICE_PRIVATE_KEY);
  iot->config(IOT_PROJECT, IOT_MODEL, IOT_SERIAL, IOT_FW_VERSION, onConnectionReady, onDataFromCloud);

  Serial.println(F("\n dSimpleIOT setup done"));
}

static void smartDelay(unsigned long ms)
{
  unsigned long start = millis();
  do
  {
    while (ss.available())
      gps.encode(ss.read());
  } while (millis() - start < ms);
}
//////////////////////////////////////////////////////

/*
 * Standard giant Arduino loop. We read all the sensor values, then
 * compare them to cached values, and if within delta range of last one,
 * transmit them to the cloud and show them on the display.
 */
void loop() {

float temperature = 0.0;
float humidity = 0.0;
float pressure = 0.0;
bool satellite_valid = false;

char strBuf[20];

  // Satellite data is attached to readings if they are available.
  //
  satellite_valid = gps.location.isValid();
  if (satellite_valid) {
    showHaveGps();
    last_lat = gps.location.lat();
    last_lng = gps.location.lng();
//    Serial.print("Lat: ");
//    Serial.print(last_lat);
//    Serial.print(" - Lng: ");
//    Serial.println(last_lng);
  } else {
    hideHaveGps();
  }

  // We only send values to cloud if they've changed.
  //
  signed short int encoder_value = encoder.getEncoderValue();
  bool btn_status = encoder.getButtonStatus(); 
  if (last_encoder_value != encoder_value) {    
    last_encoder_value = encoder_value;
//    Serial.print("Encoder value: ");
//    Serial.println(encoder_value);
//    Serial.print("Button: ");
//    Serial.println(btn_status);

    showSending();
    if (satellite_valid) {
        iot->set("rotary", (int) encoder_value, last_lat, last_lng);
      } else {
        iot->set("rotary", (int) encoder_value);
      }
      displayRotary(encoder_value);
      hideSending();
  }

  // Pressure, temperature and humidity values come from the ENV-III sensor
  //
//  Serial.println(F("Getting Temp/Humid value"));
  if (sht30.get() == 0) {
    temperature = sht30.cTemp;
    humidity = sht30.humidity;
//    Serial.print("Temp: ");
//    Serial.println(temperature);
//    Serial.print("Hum: ");
//    Serial.println(humidity);
  } else {
    temperature = 0.0;
    humidity = 0.0;
  }

  // When displaying the contents, we can use the Lcd setCursor/printf
  // if using standard fonts. But if using custom fonts, they don't 
  // erase the background so we have to use a manual method to erase the background
  // and redraw them. Saving the setCursor/printf calls here to show how those work.
  //
  if (abs(last_temperature - temperature) > TEMP_DELTA) {
    last_temperature = temperature;
    showSending();
    if (satellite_valid) {
      iot->set("temperature", temperature, last_lat, last_lng);
    } else {
      iot->set("temperature", temperature);
    }
    displayTemp(temperature);
    hideSending();
  }

  if (abs(last_humidity - humidity) > HUMIDITY_DELTA) {
    last_humidity = humidity;
    showSending();
    if (satellite_valid) {
      iot->set("humidity", humidity, last_lat, last_lng);
    } else {
      iot->set("humidity", humidity);
    }
    displayHumidity(humidity);
    hideSending();
  }

  // Pressure values are returned in 6-digit Pa units which won't fit into the 
  // display as designed. So we truncate it at an aribtrary point so it fits but still changes.
  // Please don't use this for real.
  // 
//  Serial.println(F("Getting Pressure"));
  pressure = qmp6988.calcPressure() / (float) PRESSURE_DIVISOR;
  if (abs(last_pressure - pressure) > PRESSURE_DELTA) {
    last_pressure = pressure;
//    Serial.print(F("Pressure: "));
//    Serial.println(pressure);

    showSending();
    if (satellite_valid) {
      iot->set("pressure", pressure, last_lat, last_lng);
    } else {
      iot->set("pressure", pressure);
    }
    displayPressure(pressure);
    hideSending();
  }

  // NOTE: this needs to be called to let SimpleIOT and MQTT send and receive data. 
  // The delay is how many  milliseconds you want to wait between each call. 
  // A smaller number will yield more accurate delta values, but could overload the I2C bus.
  //
  iot->loop();

  smartDelay(SENSOR_SCAN_TIME_SECS * 1000);

  if (millis() > 5000 && gps.charsProcessed() < 10)
    Serial.println(F("No GPS data received: check wiring"));
}
