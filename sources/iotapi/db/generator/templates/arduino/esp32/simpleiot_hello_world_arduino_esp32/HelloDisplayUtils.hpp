/*
 * © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 * 
 * These are utility routines for showing the display. We're keeping them separate
 * to let the hello world focus on functionality instead of display.
*/

#ifndef _DISPLAY_UTILS_
#define _DISPLAY_UTILS_ 1
#include <M5Core2.h>

/* These are for displaying the 'Connecting' and main 'Hello World' screen using the
 * imported TTF font. The images are JPGs that have been converted to C using the jpeg2code.py
 * script, and the fonts were converted to a .h file from https://rop.nl/truetype2gfx
 */
#include "Poppins_Regular20pt7b.h"
extern const unsigned char HelloWorldM5_Connecting[];
extern const unsigned char HelloWorldM5_Base[];
extern const unsigned char Planet_Original[];
extern const unsigned char Planet_Red[];
extern const unsigned char Planet_Blue[];
extern const unsigned char Planet_Green[];

typedef enum {
    PLANET_ORIGINAL,
    PLANET_RED,
    PLANET_BLUE,
    PLANET_GREEN
} PlanetColor;

void showStartupScreen();
void showHelloWorldBackground();
void setCurrentColor(PlanetColor color);
void eprint(char* txt, int x, int y, int width);

/* NOTE
 * On the M5 Cores, do NOT call Serial.begin or Wire.begin. These are already called inside the 
 * M5.begin call and will freeze the device if called twice. The default Serial speed is 115200.
 * More info here: https://github.com/m5stack/m5-docs/blob/master/docs/en/api/system.md
*/
void updateDisplay(int button);

#endif
