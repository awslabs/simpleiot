# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# This script can be used for a variety of tasks related to the SimpleIOT installer.
#
# To run this script you need to have Python "invoke" and Docker set up and the engine running.
# If developing the installer locally, the pre-requisites need to be installed. These include:
#
#   - Docker
#   - AWS CLI
#   - AWS CDK
#   - Python3
#   - NPM
#   - Node
#
#   - Building a Docker image (requires installation of Docker and pre-requisited)
#   - Deploying it as an image to Docker (NOTE that the DOCKER_IMAGE variable below has to be adjusted)
#   - Resetting the Docker environment to get rid of ALL the cached material (don't use if you have
#     other containers you are working on.
#
# On the consumer side, we may split this into a different script, but it runs the installer
# operations that used to be run locally to setup, except this time they are sent over to the
# installer image inside the container. These include:
#
#   - bootstrap
#   - deploy
#   - dbsetup
#   - clean
#
# NOTE: if there are issues running dbsetup and connecting to the database, it's usually because of
# a mis-match in Postgres libraries and the databases. The first place to check is to terminal into
# the docker installer container, then run:
#
# % python3
# >>> import psycopg2
# >>> print(psycopg2.__libpq_version__)
#
# This prints out the current version of libpq. If it's too old, update the Dockerfile to install a
# more recent version of postgres, then rebuild the image and test.
#


from invoke import task
import os
import os.path
import sys
import pwd

LOCAL_DOCKER_IMAGE = "framinlab/simpleiot" # for local testing.
TEST_PUBLIC_DOCKER_IMAGE = "framinlab/simpleiot-installer" # for remote testing
PUBLIC_DOCKER_IMAGE = "amazon/simpleiot-installer" # Official approved dockerhub repo
LOCAL_OUT_DIR = "/tmp/simpleiot-layer"


#
# This checks to see if the ~/.simpleiot directory exists or not. If not, it creates it so the
# docker mapping to the directory works.
#
def create_settings_if_not_exist():
    abs_path = os.path.expanduser("~/.simpleiot")
    if not os.path.exists(abs_path):
        os.mkdir(abs_path)

#
# Use this to rebuild the image. Only works on systems that have installed the simpleiot repo
# and installed all the pre-requisites.
#
@task()
def buildlocal(c):
    create_settings_if_not_exist()
    c.run(f"docker image build --progress=plain  -t {LOCAL_DOCKER_IMAGE}:latest .",
          pty=True)

@task()
def buildtest(c):
    command = f"docker buildx build --platform linux/amd64,linux/arm64 --load --progress=plain -t {TEST_PUBLIC_DOCKER_IMAGE}:latest ."
    print(f"Invoking for test public repo: {command}")
    c.run(command, pty=True)

#
# This assumes the image has been built and is ready to be pushed out
#
@task()
def publish(c):
    command = f"docker buildx build --platform linux/amd64,linux/arm64 --progress=plain --push -t {PUBLIC_DOCKER_IMAGE}:latest ."
    print(f"Invoking for public repo: {command}")
    c.run(command, pty=True)

#
# This assumes the image has been built and is ready to be pushed out
#
@task()
def publishtest(c):
    command = f"docker buildx build --platform linux/amd64,linux/arm64 --progress=plain --push -t {TEST_PUBLIC_DOCKER_IMAGE}:latest ."
    print(f"Invoking for test public repo: {command}")
    c.run(command, pty=True)

#
# Resets the docker build artifacts
#
@task()
def resetbuild(c):
    create_settings_if_not_exist()
    c.run(f"docker system prune -a -f; \
            docker container prune -f; \
            docker volume prune -f; \
            docker image prune -f; \
            docker system df")

#
# Install from an image on Dockerhub
#
@task()
def install(c):
    create_settings_if_not_exist()
    c.run(f"docker build --tag simpleiot-installer .", pty=True)

#
# This command is a template for running the actual command inside the docker container
# that we have already installed. If not installed, it pulls the image in.
#
def run_in_docker(c, cmd, param=None, team=None, user=True, image=PUBLIC_DOCKER_IMAGE):
    print(f"Running from image: {PUBLIC_DOCKER_IMAGE}")
    create_settings_if_not_exist()
    abs_aws_path = os.path.expanduser("~/.aws")
    abs_simpleiot_path = os.path.expanduser("~/.simpleiot")
    if not os.path.exists(LOCAL_OUT_DIR):
        os.mkdir(LOCAL_OUT_DIR)

    user_flag = ""

    # TODO: If the --user flag is needed on Windows, we need to extract the uid:gid using Windows APIs. getpwuid is a POSIX function.
    #
    if user:
        if sys.platform == 'win32':
            pass
        else:
            suid = pwd.getpwuid(os.getuid())
            uid = suid.pw_uid
            gid = suid.pw_gid
            user_flag = f"--user {uid}:{gid}"

    command = f"{cmd}"
    if param:
        command = f"{command} {param}"
    if team:
        command = f"{command} {team}"
    c.run(f"docker run -i \
            --network host \
            {user_flag} \
            -v /var/run/docker.sock:/var/run/docker.sock \
            --mount type=bind,source='{abs_aws_path}',target=/root/.aws \
            --mount type=bind,source='{abs_simpleiot_path}',target=/root/.simpleiot \
            --mount type=bind,source='{LOCAL_OUT_DIR}',target='/opt/iotapi/iotcdk/lib/lambda_src/layers/iot_import_layer/out' \
            -t {image}:latest {command}", pty=True)

@task()
def terminallocal(c):
    run_in_docker(c, "/bin/bash", user=False, image=LOCAL_DOCKER_IMAGE)


@task()
def terminaltest(c):
    run_in_docker(c, "/bin/bash", user=False, image=TEST_PUBLIC_DOCKER_IMAGE)


@task()
def terminal(c):
    run_in_docker(c, "/bin/bash")

#
# Run 'invoke bootstrap' inside the docker image. It should write its settings to the ~/.simpleiot
# directory.
#
@task()
def bootstrap(c, team=None):
    run_in_docker(c, "invoke", "bootstrap")

#
# Perform the deploy. It should read from inside the ~/.simpleiot directory
#
@task()
def deploy(c, team):
    run_in_docker(c, "invoke", "deploy", team)

#
# Run dbsetup
#
@task()
def dbsetup(c, team):
    run_in_docker(c, "invoke", "dbsetup", team)

#
# Run clean on the installer. It removes the back-end and cleans things up.
#
@task()
def clean(c, team):
    run_in_docker(c, "invoke", "clean", team)
