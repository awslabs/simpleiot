#!/usr/bin/env node

// © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
//
// SimpleIOT project.
// Author: Ramin Firoozye (framin@amazon.com)
//
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { IotcdkStack } from '../lib/iotcdk-stack';

var path = require('path');

let IOT_TEAM_PATH = process.env["IOT_TEAM_PATH"]
let bootstrap_path = path.join(IOT_TEAM_PATH, "bootstrap.json")

import(bootstrap_path).then(bootstrap => {
    const app = new cdk.App();
    let env = { account: bootstrap.account, region: bootstrap.region };

    new IotcdkStack(app, 'Iotcdk', {
        env: env
    });
});
