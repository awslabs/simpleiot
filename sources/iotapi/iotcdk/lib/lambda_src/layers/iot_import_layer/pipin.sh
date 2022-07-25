#!/bin/bash

echo "Installing $1 in site-packages"
pip install $1 -t python/lib/python3.8/site-packages

