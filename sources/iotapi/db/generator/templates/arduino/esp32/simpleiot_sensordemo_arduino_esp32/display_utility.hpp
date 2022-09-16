/*
 * © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 * 
 * This is an example program that reads an M5Stack ENV-III device and a rotary knob
 * and sends the values to AWS IOT using the SimpleIOT library. If a GPS is connected, it will
 * also attach lat/long values.
 * 
*/
#ifndef _DISPLAY_UTILS_
#define _DISPLAY_UTILS_ 1

#include <M5Core2.h>
#include "Free_Fonts.h"

void setupSprites();
void showStartupScreen();
void showConnecting();
void hideConnecting();
void showConnected();
void hideConnected();
void showSending();
void hideSending();
void showHaveGps();
void hideHaveGps();
void displayPressure(float pressure);
void displayTemp(float temp);
void displayHumidity(int humidity);
void displayRotary(int rotary);
void showFirmwareVersion(String version);



#endif
