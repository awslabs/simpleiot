#!/bin/bash

if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Please start docker and try again."
  exit 1
fi

PYTHON_VERSION="3.8"
OUTPUT_DIR="out"

echo "Generating lambda layer for lambda python version: ${PYTHON_VERSION}"

if [ -x $OUTPUT_DIR ]; then
  echo "Cleaning out old output directory"
  chmod -R 770 $OUTPUT_DIR
	rm -rf $OUTPUT_DIR  > /dev/null 2>&1
fi

DOCKER_BUILDKIT=1 docker build \
						--build-arg PYTHON_VERSION=$PYTHON_VERSION \
						--target copy \
						--quiet \
						--output $OUTPUT_DIR .
chmod -R 770 $OUTPUT_DIR

