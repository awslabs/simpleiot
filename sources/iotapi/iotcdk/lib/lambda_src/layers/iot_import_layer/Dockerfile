# syntax=docker/dockerfile:1
#
# © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
#
# We assume the following params have been passed down to us:
#
# PYTHON_VERSION: version of python to use to create layer. Note that this should match the name
# of the container in DockerHub.
#
ARG PYTHON_VERSION

FROM python:${PYTHON_VERSION}-slim-buster as dev

WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

FROM dev as build
ARG PYTHON_VERSION

ENV INSTALL_DIR="/app/python/lib/python${PYTHON_VERSION}/site-packages"
RUN rm -rf "$INSTALL_DIR"
RUN mkdir -p "$INSTALL_DIR"
RUN pip install -r requirements.txt --ignore-installed --target "$INSTALL_DIR"
RUN rm /app/requirements.txt


#
# We copy the python installation folder to the host so it can be used as part of CDK deployment.
# The buildlayer.sh script that invoked this with "--output out ." copies the contents of the root
# to the 'out' folder in the host. Then the CDK picks it up from the 'out' folder during
# lambda layer creation.
#
# NOTE that this build stage is from 'scratch' instead of 'build' and Docker CLI honors the
# COPY directive for the very last build stage.
#
FROM scratch as copy
COPY --from=build /app /
