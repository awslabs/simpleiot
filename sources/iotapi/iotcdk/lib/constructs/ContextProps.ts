/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import {CDKPreInstall} from "./cdk_preinstall";
import {CDKIam} from "./cdk_iam";
import {CDKDatabase} from "./cdk_database";
import {CDKNetwork} from "./cdk_network";
import {CDKCognito} from "./cdk_cognito";
import {CDKTimestream} from "./cdk_timestream";
import {CDKPostInstall} from "./cdk_postinstall";
import {CDKLambdaLayer} from "./cdk_lambdalayer";
import {CDKLambda} from "./cdk_lambda";
import {CDKStaticIOT} from "./cdk_staticiot";

/*
 * This is used to pass live data between different stacks.
 */
export interface ContextProps extends cdk.NestedStackProps {
    preInstall?: CDKPreInstall;
    iam?: CDKIam;
    database?: CDKDatabase;
    network?: CDKNetwork;
    cognito?: CDKCognito;
    timestream?: CDKTimestream;
    postInstall?: CDKPostInstall;
    lambdaLayer?: CDKLambdaLayer;
    lambda?: CDKLambda;
    staticIot?: CDKStaticIOT;
    config: { [ name: string ]: any };
}
