/*
 * © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 * 
 * This is an example program that reads an M5Stack ENV sensor and a rotary knob
 * and sends the values to AWS IOT using the SimpleIOT library. It also accepts
 * and processes return commands via the 'color' parameter.
*/
#include <M5Core2.h>
#include <Wire.h>
#include "Adafruit_Sensor.h"
#include <Adafruit_BMP280.h>
#include "SHT3X.h"
#include "Free_Fonts.h"
#include <ArduinoJson.h>
#include "FastLED.h"

#include "iot-secrets.h"  // NOTE: this contains the certs for the remote service
#include "wifi-settings.h" // and the local wifi-settings
#include <SimpleIOT.h>

SHT3X sht30;
Adafruit_BMP280 bme;

// LED strips on the side
//
#define LEDS_PIN 25
#define LEDS_NUM 10
CRGB ledsBuff[LEDS_NUM];

// To be filled by template processor at runtime.
//
#define IOT_PROJECT "{{ project }}"
#define IOT_MODEL   "{{ model }}"
#define IOT_SERIAL  "{{ device }}"
#define IOT_FW_VERSION "{{ version }}"

/* Singleton instance of SimpleIOT with the WIFI credentials and IOT endpoint value */

SimpleIOT* iot = NULL;

/* Variables to hold data read from the devices. The last_xxxx values are used
 *  to cache read values and only transmit them when the delta between the current
 *  reading the and the new value exceeds the XXX_DELTA settings.
 *  This is to prevent too much data (or duplicates of the same data getting sent out.
 *  This, obviously is very application-specific.
 */
float temperature = 0.0;
float humidity = 0.0;
float pressure = 0.0;
int angle_pin = 36;
int last_angle = 100;
int current_angle = 0;
int last_degree = 0;
float last_temperature = 0.0;
float last_humidity = 0.0;
float last_pressure = 0.0;

#define TEMP_DELTA  1.0
#define HUMIDITY_DELTA 5.0
#define PRESSURE_DELTA 2.0
#define PRESSURE_FLOOR 99000

#define ADC_REF 3.3
#define GROVE_VCC 3.3
#define FULL_ANGLE 180 

#define FIRST_X 65
#define SECOND_X 215
#define FIRST_Y 115
#define SECOND_Y 203


extern const unsigned char Background300[];


// We're using proportional fonts, which won't erase the background, so we have to do manual
// erasing.
//
// More here: https://learn.adafruit.com/adafruit-gfx-graphics-library/using-fonts
//
// M5.Lcd doesn't have a getTextBounds method, so we have to guess how wide and high
// to erase the background before drawing again.
// This value is roughly the width and height of each field. We have to offset
// backward to make sure it draws in the right place
//
int xOffset = -2;
int yOffset = -35;
int eraseBlockWidth = 100;
int eraseBlockHeight = 50;

void eprint(String txt, int x, int y)
{
//  M5.Lcd.getTextBounds(string, x, y, &x1, &y1, &w, &h);
  M5.Lcd.fillRect(x+xOffset, y+yOffset, eraseBlockWidth, eraseBlockHeight, BLACK);
  M5.Lcd.setCursor(x, y);
  M5.Lcd.print(txt);
}


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
      Serial.println(">>>Set LED to RED");
    } else
    if (value.equalsIgnoreCase("green")) {
      setLedColor(0, 255, 0);
      Serial.println(">>>Set LED to GREEN");
    } else
    if (value.equalsIgnoreCase("blue")) {
      setLedColor(0, 0, 255);
      Serial.println(">>>Set LED to BLUE");
    } else
    if (value.equalsIgnoreCase("off")) {
      setLedColor(0, 0, 0);
      Serial.println(">>>Set LED to OFF");
    }
  }
}

/* NOTE NOTE NOTE
 * On the M5 Cores, do NOT call Serial.begin or Wire.begin. These are already called inside the 
 * M5.begin call and will freeze the device if called twice. The default Serial speed is 115200.
 * More info here: https://github.com/m5stack/m5-docs/blob/master/docs/en/api/system.md
*/
void setup() {
  
  M5.begin();

  // Per: https://community.m5stack.com/topic/2676/m5-lcd-setbrightness-not-working/2
  // On Core2, the setBrightness is capped. To get it full brightness you have to set 
  // the display voltage level from 2500 to 3300

  //M5.Lcd.setBrightness(128);
  M5.Axp.SetLcdVoltage(3300); 

  initLedBar();
  
  M5.Lcd.setTextColor(WHITE, BLACK);
//  M5.Lcd.setTextSize(3);
  M5.Lcd.setFreeFont(FF24);

  M5.Lcd.drawBitmap(0, 0, 320, 240, (uint16_t *) Background300);
  
  Serial.println("SensorDemo: starting");

  // Set angle input pin
  //
  pinMode(angle_pin, INPUT);

  Serial.println("ENVRotary: initializing BMP280 sensor");

  while (!bme.begin(0x76)){  
    Serial.println("Could not find a valid BMP280 sensor, check wiring!");
    M5.Lcd.println("Could not find a valid BMP280 sensor, check wiring!");
  }

  Serial.println("ENVRotary: Setting up IOT config");

  /* 
   * Initialize and configure a SimpleIOT instance.
   */
  iot = SimpleIOT::create(WIFI_SSID, WIFI_PASSWORD, SIMPLEIOT_IOT_ENDPOINT, 
                          SIMPLE_IOT_ROOT_CA, SIMPLE_IOT_DEVICE_CERT, SIMPLE_IOT_DEVICE_PRIVATE_KEY);
  iot->config(IOT_PROJECT, IOT_MODEL, IOT_SERIAL, IOT_FW_VERSION, onConnectionReady, onDataFromCloud);

  Serial.println("Setup done");
}

//////////////////////////////////////////////////////

/*
 * Standard giant Arduino loop. We read all the sensor values, then
 * compare them to cached values, and if within delta range of last one,
 * transmit them to the cloud and show them on the display.
 */
void loop() {

char strBuf[20];

  // Pressure, temperature and humidity values from the ENV-II sensor
  // We clamp the pressure value to a baseline value so it doesn't overflow the display.
  //
  pressure = bme.readPressure() - PRESSURE_FLOOR;
  
  if(sht30.get()==0){
    temperature = sht30.cTemp;
    humidity = sht30.humidity;
  }

  // This reads the analog value from the rotary knob and converts it into 0-720 degree range.
  //
  current_angle = analogRead(angle_pin);

  if(abs(current_angle - last_angle) > 10) {
    last_angle = current_angle;
  }
  float voltage = (float) last_angle * ADC_REF/1023;
  int degree = (int) ((voltage * FULL_ANGLE)/GROVE_VCC);


  // We only send values to cloud if they've changed.
  //
  // When displaying the contents, we can use the Lcd setCursor/printf
  // if using standard fonts. But if using custom fonts, they don't 
  // erase the background so we have to use a manual method to erase the background
  // and redraw them. Saving the setCursor/printf calls here to show how those work.
  //
  if (abs(last_temperature - temperature) > TEMP_DELTA) {
    last_temperature = temperature;
    iot->set("temperature", temperature);
    sprintf(strBuf, "%2.1f", temperature);
    eprint(strBuf, FIRST_X, FIRST_Y);
  }
  
  if (abs(last_humidity - humidity) > HUMIDITY_DELTA) {
    last_humidity = humidity;
    iot->set("humidity", humidity);
    sprintf(strBuf, "%2.0f%%", humidity);
    eprint(strBuf, SECOND_X, FIRST_Y);
  }
  // Pressure values are returned in 6-digit Pa units which won't fit into the 
  // display as designed. So we truncate it at an aribtrary point so it fits but still changes.
  // Please don't use this for real.
  // 
  if (abs(last_pressure - pressure) > PRESSURE_DELTA) {
    last_pressure = pressure;
    iot->set("pressure", pressure);
    sprintf(strBuf, "%2.0f%", pressure);
    eprint(strBuf, SECOND_X, SECOND_Y);
  }
  if (degree != last_degree) {
    last_degree = degree;
    iot->set("rotary", (int) degree);
    sprintf(strBuf, "%03d", degree);
    eprint(strBuf, FIRST_X, SECOND_Y);
  }

  // NOTE: this needs to be called to let SimpleIOT and MQTT send and receive data. 
  // The delay is how many  milliseconds you want to wait between each call. 
  // A smaller number will yield more accurate delta values, but could overload the I2C bus.
  //
  iot->loop(100);
}
