/*
 * © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 * 
 * This is an example program that reads an M5Stack ENV-III device and a rotary knob
 * and sends the values to AWS IOT using the SimpleIOT library. If a GPS is connected, it will
 * also attach lat/long values.
 * 
 * Display material.
 * https://github.com/Bodmer/TFT_eSPI - the display library for the M5 is based on TFT_eSPI
 *
 * The Display consists of a single background image, along with several different sprite overlays.
 * The sprites include:
 *  - Background
 *    - Connecting Message (or error)
 *    - Temperature value
 *    - Humidity
 *    - Pressure
 *    - Rotary value
 *    - GPS available (or not)
 *    - Transmitting signal
 *    - Firmware version
*/

#include "display_utility.hpp"
#include "Free_Fonts.h"


extern const unsigned char Background300[];
extern const unsigned char connected_2_20[];
extern const unsigned char satellitedish[];
extern const unsigned char green_dot[];

TFT_eSprite backgroundSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite connectedSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite sendingSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite gpsSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite temperatureSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite humiditySprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite pressureSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite rotarySprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite connectingMessageSprite = TFT_eSprite(&M5.Lcd);
TFT_eSprite firmwareVersionSprite = TFT_eSprite(&M5.Lcd);

// Display units - for column and row position of this app's numbers
//
#define FIRST_X 60
#define SECOND_X 215
#define FIRST_Y 80
#define SECOND_Y 170

#define UPDATE_X 20
#define UPDATE_Y 220

#define FW_VERSION_LABEL_X 240u
#define FW_VERSION_LABEL_Y 228


void setupSprites()
{
  backgroundSprite.createSprite(320, 240);

  connectingMessageSprite.createSprite(100, 20);
  connectingMessageSprite.setTextFont(3);
  
  connectedSprite.createSprite(20, 20);
  sendingSprite.createSprite(10, 10);
  gpsSprite.createSprite(20, 20);

  firmwareVersionSprite.createSprite(100, 20);
  firmwareVersionSprite.setTextFont(1);

  temperatureSprite.createSprite(100, 40);
  temperatureSprite.setFreeFont(FF24);

  humiditySprite.createSprite(100, 40);
  humiditySprite.setFreeFont(FF24);

  pressureSprite.createSprite(100, 40);
  pressureSprite.setFreeFont(FF24);

  rotarySprite.createSprite(100, 40);
  rotarySprite.setFreeFont(FF24);
}


void showStartupScreen()
{
  backgroundSprite.fillSprite(BLACK);
  backgroundSprite.drawJpg(Background300, 23941); // Get the size from the included file declaration-sizeof doesn't work.
  backgroundSprite.pushSprite(0, 0);
}

void showConnecting()
{
  connectingMessageSprite.fillScreen(TFT_BLACK);
  connectingMessageSprite.setTextColor(TFT_WHITE);
  connectingMessageSprite.drawString("Connecting", 0, 0, 2);
  connectingMessageSprite.pushSprite(160, 15);
}

void hideConnecting()
{
  connectingMessageSprite.fillScreen(TFT_BLACK);
  connectingMessageSprite.pushSprite(160, 15);
}

void showConnected()
{
  connectedSprite.fillScreen(TFT_BLACK);
  connectedSprite.drawJpg(connected_2_20, 1388);
  connectedSprite.pushSprite(170, 15);
}

void hideConnected()
{
  connectedSprite.fillScreen(TFT_BLACK);
  connectedSprite.pushSprite(170, 15);
}

void showSending()
{
  sendingSprite.fillScreen(TFT_BLACK);
  sendingSprite.drawJpg(green_dot, 1367);
  sendingSprite.pushSprite(235, 20);
}

void hideSending()
{
  sendingSprite.fillScreen(TFT_BLACK);
  sendingSprite.pushSprite(235, 20);
}

void showHaveGps()
{
  gpsSprite.fillScreen(TFT_BLACK);
  gpsSprite.drawJpg(satellitedish, 1472);
  gpsSprite.pushSprite(200, 15);
}

void hideHaveGps() 
{
  gpsSprite.fillScreen(TFT_BLACK);
  gpsSprite.pushSprite(200, 15);
}


void displayTemp(float temp)
{
  temperatureSprite.fillScreen(TFT_BLACK);
  temperatureSprite.setTextColor(TFT_WHITE);
  temperatureSprite.drawFloat(temp, 1, 0, 0);
  temperatureSprite.pushSprite(FIRST_X, FIRST_Y);
}

void displayHumidity(int humidity)
{
  humiditySprite.fillScreen(TFT_BLACK);
  humiditySprite.setTextColor(TFT_WHITE);
  humiditySprite.drawNumber((int) humidity, 0, 0);
  humiditySprite.pushSprite(SECOND_X, FIRST_Y);
}

void displayRotary(int rotary)
{
  rotarySprite.fillScreen(TFT_BLACK);
  rotarySprite.setTextColor(TFT_WHITE);
  rotarySprite.drawNumber(rotary, 0, 0);
  rotarySprite.pushSprite(FIRST_X, SECOND_Y);
}

void displayPressure(float pressure)
{
  pressureSprite.fillScreen(TFT_BLACK);
  pressureSprite.setTextColor(TFT_WHITE);
  pressureSprite.drawNumber((int) pressure, 0, 0);
  pressureSprite.pushSprite(SECOND_X, SECOND_Y);
}

void showFirmwareVersion(String version)
{
  firmwareVersionSprite.fillScreen(TFT_BLACK);
  firmwareVersionSprite.setTextColor(TFT_WHITE);
  firmwareVersionSprite.drawString("Version:" + version, 0, 0);
  firmwareVersionSprite.pushSprite(FW_VERSION_LABEL_X, FW_VERSION_LABEL_Y);
}
