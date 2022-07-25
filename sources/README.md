# Docker Image Installation

This section describes how to build and release a `simpleiot-installer` image.

To run these, you will need Python 3.9+ and Docker Engine with dockerx support.

---
**NOTE**

As of this writing, this process has only been tested on Mac M1s. YMMV.

---

## Background

The installer has three distinct phases:

- **bootstrap**: setup CDK, create SSH keys, and validate constructs.
- **deploy**: push to cloud and provision all components.
- **dbsetup**: load SQL schema in RDS, pre-load with demo data, and create initial users.

You can run these all in one go by invoking a single `install` command.

If you are doing development on the installer, you will likely be making changes to the CDK or lambda sources. These can all be done inside the `iotapi` directory. In that case, you'll want to build and test locally on your own machine.

Doing so requires having a number of pre-requisites (like **npm**, **aws cli**, **cdk**, etc.) installed on your machine. The `iotapi` directory has its own python virtual environment as well. If doing local development, please look inside that directory first.

Once all development and testing has been done, you can package everything up in a Docker container and test it at this level. Doing so requires Python 3.9+ and Docker Desktop. At this point, you can compile a local docker image, test using that image as your installation source, then push it all out to DockerHub for public use.

This document covers the deployment process with a built docker image. Note that in order for publishing to work, you have to select the right DockerHub image (look inside `tasks.py`) and must be logged in with the proper credentials using the Docker CLI's `docker login` command.

Note that the `dockerx` cross-build tool is used to push out both ARM64 and x86 images. When you run the `invoke publish` command, both versions are automatically pushed out.

## Setup

To create the Docker publishing environment, we recommend creating a virtual environment and loading the pre-requisites into there:

To build and publish to DockerHub, you need to have:

- [Docker Desktop](https://docs.docker.com/get-docker/) (including the Docker CLI).
- [Python 3.9+](https://www.python.org/downloads/) 

Once installed, open a terminal and run:

```
% python3 -m venv venv 
% source venv/bin/activate
% pip install -r dev-requirements.txt
```
This will activate the virtual environment and allow you to run the remaining
PyInvoke tasks.

```
% invoke --list
Available tasks:

  bootstrap
  build
  clean
  dbsetup
  deploy
  install
  publish
  publishtest
  resetbuild
  terminal
```

The commands allow you to build and test the image incrementally, or publish the whole thing in one go.

### invoke bootstrap

The _bootstrap_ step installs the necessary SSH keys and runs the CDK pre-requisites. It also asks the user for AWS account credentials, name of SimpleIOT team to use for the installation, and generates the local directory with the team name inside the `~/.simpleiot` directory.

This version of the command run bootstrap inside the local Docker container (instead of natively on the development machine).

### invoke build

This can be used to build a local image for the current system. It can be used for local testing. The default  repository can be specified in the `LOCAL_DOCKER_IMAGE` variables inside the `tasks.py` file.


### invoke clean [team]

This runs the  `clean` command inside the container. This will remove the backend and delete all previously created SSH keys. It also removes the team directory inside the local `~/.simpleiot` directory. The name of the team you want to clean has to be provided.


### invoke dbsetup [team]

This runs the third phase of installation from inside the container. This will erase any existing database, re-create the database schema, and load it with preset values. It also creates the specified users inside Cognito. You can run this command multiple times, but the Cognito users will only be created the first time. Running it again deletes all database records and schema and starts with a clean slate.

### invoke deploy [team]

This command runs CDK and deploys the entire back-end architecture to the account provided during Bootstrap. It usually takes between 20-30 minutes to finish its deployment. It is recommended that this not be interrupted.

If any stage of this phase fails, you may want to run `invoke clean` to make sure any interim artfacts are cleaned out.

### invoke install

This command runs `bootstrap` followed by `deploy` and `dbsetup.` It can be used to do a single-step install of the entire system.

### invoke publish

This runs `dockerx` to both build and publish the image to the repository specified in the `PUBLIC_DOCKER_IMAGE` variable in `tasks.py`.

### invoke publishtest

This runs 'dockerx' to both build and publish the image to the repository, but instead of going to the public repo, it will publish to a remote test repository specified in the `TEST_PUBLIC_DOCKER_IMAGE` variable in `tasks.py`. This can be used to troubleshoot initial deployment to DockerHub. 

### invoke resetbuild

---
<div style="color: red;">ALERT</div>

Running this command will remove ALL containers, images, and volumes on your machine. BE VERY CAREFUL when running this. It is here for debugging container creation and publishing.

Do NOT run this command unless your system can stand having all its local cached containers removed. This does not affect your remote repositories. Just whatever is loaded on your local system.

---

You can run this to clean out your clogged Docker Desktop pipes and get rid of cached images. It basically NUKES your entire Docker Desktop cache! Be very careful!

### invoke terminal

Once you've published the image to the public registry, you can use this command to create a local terminal inside the image. There, you can see what volumes have been mounted and what source files are present. It can be used to look for problems in a built image.

### Miscellaneous

Once an `install` step has been run, you can check the endpoints and generated configuration data under `~/.simpleiot`. The `config.json` file is the merged single source. The administrator should be the only individual with this data. All other end-users will be provided a minimal subset of material they need in order to run. That subset is generated and sent to them via the `iot team invite` command.


# Next Steps

Once the Docker image has been pushed out, you can verify that it is working by installing `simpleiot-cli` and running `iot cloud install`. That command will downloads the image and does an `invoke install` and is how administers can create a new installation/team.




### License

All material released under Apache 2.0 license.

