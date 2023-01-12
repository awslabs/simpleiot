# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# syntax=docker/dockerfile:1
FROM amazonlinux:latest
ARG TARGETARCH

# We need to do this to avoid installation of time-zone stopping to ask for user input
#
RUN ln -snf /usr/share/zoneinfo/$CONTAINER_TIMEZONE /etc/localtime && echo $CONTAINER_TIMEZONE > /etc/timezone


# Allow for caching python modules -- at least 3.7. If we end up installing a more recent version
# of python, this has to also be modified.

VOLUME ["/usr/lib/python3.7/site-packages/"]

# Now we copy the entire SimpleIOT installer + CDK into the image.
#
COPY iotapi /opt/iotapi
WORKDIR /opt/iotapi

#
# In case we need to install a newer version of python than what's available in yum,
# this can be used. However, the python3x-devel packages (which include python C headers)
# would also need to be manually installed. For now, we're relying on the version in
# yum (which at the moment is 3.7).
#
#RUN export PYTHON_VERSION=`amazon-linux-extras | grep -i python | tail -n 1 | awk -F ' ' '{print $2}'`; \
#    amazon-linux-extras install $PYTHON_VERSION -y; \
#    sudo rm /usr/bin/python3; \
#    sudo ln -s /usr/bin/$PYTHON_VERSION /usr/bin/python3; \
#    curl -O https://bootstrap.pypa.io/get-pip.py; \
#    $PYTHON_VERSION get-pip.py

#
# We may need to install libsodium from source for later pip PyNaCl package install.
# It's not available in repos for certain architectures.
#
#WORKDIR /tmp
#
#RUN curl https://download.libsodium.org/libsodium/releases/LATEST.tar.gz --output libsodium.tar.gz; \
#    tar -xf libsodium.tar.gz; \
#    cd libsodium-stable; \
#    ./configure; \
#    make && make check; \
#    sudo make install

#
# We install the pip requirements so the invoke command works. They're installed after the yum commands so
# they run inside the same layer in the right sequence.
#

#
# Install the commands needed to build the downstream pakckages.
#
# NOTE: postgres version is the highest one supported by amazon-linux-extras. At this point, that' v14.
# It should not exceed what is being installed inside RDS in the CDK, otherwise database loading might fail.
#
# Also, we're doing a lot of this so we can build psycopg2 from source. At the time of this release, there
# has been a long-standing issue with psycopg2-binary which this gets around.
#
# If this comes up again, check to make sure the postgres version is a matching one available on amazon-linux-extras.
#    sudo amazon-linux-extras install postgresql14 <-- this should be the latest version.

#
RUN yum -y install sudo && \
    sudo yum update -y && \
    sudo yum groupinstall "Development Tools" -y &&  \
    sudo amazon-linux-extras install postgresql14 && \
    sudo yum -y install \
        nano \
        python3 \
        python3-devel \
        python3-pip \
        python-lxml \
        ca-certificates \
        groff \
	    file \
        less \
        bash \
        make \
        curl \
        postgresql-libs \
        postgresql-devel \
        musl-devel \
        wget \
        tar \
        zip \
        which \
        unzip \
        git && \
    pip3 install pynacl && \
    pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Update any expired certs
#
RUN sudo yum update ca-certificates

#
# Installing via yum doesn't always get the right version of node and npm.
# Instead we install the Long-Term-Support stable version.
#
WORKDIR /home

# RUN sudo yum --enablerepo=nodesource clean metadata
#RUN sudo yum install nodejs -y

#RUN curl -sL https://rpm.nodesource.com/setup_lts.x -o /tmp/nodesource_setup.sh
RUN curl -sL https://rpm.nodesource.com/setup_16.x -o /tmp/nodesource_setup.sh
RUN sudo bash /tmp/nodesource_setup.sh
RUN sudo yum install nodejs -y

#
# Latest v2 version of CDK.
#
RUN npm install -g aws-cdk@latest
#
# Let's also get rid of the cdk v1 warning.
#
RUN cdk acknowledge 19836

#
# Installing Docker inside the container. It's needed to build the lambda layers.
# We also expose the docker socket from the outside host in the invocation command
# so it can run inside a docker container.
#
# If the version provided with amazon-linux-extras doesn't work, we can install it from get.docker.com
#
#RUN curl -sSL https://get.docker.com/ | sh
RUN yum install -y /usr/bin/systemctl
RUN amazon-linux-extras install docker -y
RUN sudo systemctl enable docker.service
RUN sudo systemctl enable containerd.service

#
# AWS CLI - we need to install for the right architecture. In a multi-arch image,
# we dynamically choose which version based on the runtime setting.
# NOTE that this only works if we use the BUILDKIT system which is part of the buildx command.
# If this is built using any other Docker command, the TARGETARCH may not be set and this will
# fail.
#
# More info here: https://docs.docker.com/engine/reference/builder/
#

RUN case $TARGETARCH in \
            amd64) echo "Loading aws-cli for AMD64-x86"; curl https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip ;; \
            arm64) echo "Loading aws-cli for ARM64"; curl https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o awscliv2.zip  ;; \
        esac;

RUN unzip awscliv2.zip
RUN ./aws/install

#
# These are needed to allow the container and directories needed by the CLI map to each
# other. The command that invokes this Docker maps those from the outside to the ones
# in the container. Since we're mounting them with bind flag to the host, we'll have to
# create the local directory.
#
RUN mkdir -p /root/.aws
RUN mkdir -p /root/.simpleiot

VOLUME [ "/root/.aws" ]
VOLUME [ "/root/.simpleiot" ]
VOLUME [ "/opt/iotapi" ]

#
# Now we install the pre-requisites in the NPM package.json file in the CDK directory
#
WORKDIR /opt/iotapi/iotcdk
RUN npm install

WORKDIR /opt/iotapi

#CMD ["cdk", "--version"]
