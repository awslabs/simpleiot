# SimpleIOT

![](https://img.shields.io/badge/Powered%20by-AWS-orange.svg?style=for-the-badge&logo=amazon-aws&logoColor=orange) ![](https://img.shields.io/badge/License-Apache2-orange.svg?style=for-the-badge)

![](htts:p//img.shields.io/badge/Python-3.9-blue.svg?style=flat)
![](https://img.shields.io/badge/Typescript-4.4.4-blue.svg?style=flat)
![](https://img.shields.io/badge/NPM-8.3.2-blue.svg?style=flat)
![](https://img.shields.io/badge/CDK-2.10.0-blue.svg?style=flat)
![](https://img.shields.io/badge/Postgres-11.9-blue.svg?style=flat)

![](https://img.shields.io/badge/AWS-API Gateway-green.svg?style=flat)
![](https://img.shields.io/badge/AWS-Cloudfront-green.svg?style=flat)
![](https://img.shields.io/badge/AWS-Cognito-green.svg?style=flat)
![](https://img.shields.io/badge/AWS-EC2-green.svg?style=flat)

![](https://img.shields.io/badge/AWS-IOT Core-green.svg?style=flat)
![](https://img.shields.io/badge/AWS-Lambda-green.svg?style=flat)
![](https://img.shields.io/badge/AWS-S3-green.svg?style=flat)
![](https://img.shields.io/badge/AWS-Timestream-green.svg?style=flat)


This repo contains the source to the back-end of the SimpleIOT framework.


### Installation Instructions

- [Start here](https://awslabs.github.io/simpleiot-build)

### Install from Source

To install from source, clone this repository, then install the following pre-requisite components:

- Docker Desktop
- AWS CLI
- CDK
- NPM
- NPM dependencies (via `npm install`) in directories containing `package.json` files.
- Python 3.9+
- Python dependencies in virtual envs, via 
  - `python3 -m venv venv`
  - `source venv/bin/activate`
  - `pip install -r requirements.txt`

Once these are installed, you can manually run the installer by going into the `simpleiot/sources/iotapi` directory, and running `invoke --list` to see the list of commands.

The three stages of installation are:

- `invoke bootstrap`
- `invoke deploy {team-name}`
- `invoke dbsetup {team-name}`

To clean up the back-end infrastructure and delete all generated settings, run:

- `invoke clean {team-name}`

For more detailed information, consult `simpleiot/sources/iotapi/README.md`.