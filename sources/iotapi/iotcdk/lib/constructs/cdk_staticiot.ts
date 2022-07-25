/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import iam = require('aws-cdk-lib/aws-iam')
import lambda = require('aws-cdk-lib/aws-lambda')
import ec2 = require('aws-cdk-lib/aws-ec2')
import { Common } from './common'
import {CDKTimestream} from "./cdk_timestream";
import {CDKIam} from "./cdk_iam";
import {CDKLambdaLayer} from "./cdk_lambdalayer";
const path = require( "path" );
import { v4 as uuidv4 } from 'uuid';

interface IStaticIOTProps extends cdk.NestedStackProps {
    prefix: string,
    stage: string,
    uuid: string,
    logLevel: string,
    vpc: ec2.IVpc,
    iam: CDKIam,
    layer: CDKLambdaLayer,
    tags: {[name: string]: any}
}

export class CDKStaticIOT extends cdk.NestedStack {

    public initResponse: string;
    public iotMonitorEndpoint: string;
    public iotSetupLambda: lambda.SingletonFunction;
    public iotCertKeyName: string;
    public iotPrivateKeyName: string;
    public iotMonitorPolicyName: string;

    constructor(scope: Construct, id: string, props: IStaticIOTProps)
    {
        super(scope, id);
        Common.addTags(this, props.tags)

        let sourcePath = path.resolve("./lib/lambda_src/iot_static_setup");

          // First, we create a singleton lambda that can create the IOT things we need.
          // Then we create a custom CFN resource to invoke it. This will be used by CDK to
          // instantiate what it needs (and delete things when it's time to clean)
          // The libraries needed by the Lambda are in the layer assigned to the lambda
          // and will be shared at runtime by IOT Thing creation mechanisms.
          //

          this.iotSetupLambda = new lambda.SingletonFunction(this, "iot_setup_singleton",
                {
                    uuid: uuidv4(),
                    handler: "main.handler",
                    runtime: Common.pythonRuntimeVersion(),
                    role: props.iam.iotLambdaFullAccessRole,
                    layers: props.layer.allLayers,
                    timeout: cdk.Duration.seconds(300),
                    code: new lambda.AssetCode(sourcePath),
                    environment: {
                        "PREFIX": props.prefix,
                        "STAGE": props.stage,
                        "IOT_LOGLEVEL": props.logLevel
                    }
                }
            )

          // Now we create the custom resource that relies on the lambda to create what is needed
          // during CDK setup. NOTE: we specify the 'resourceType' as a name so CloudFormation
          // can properly update it without getting into a dependency loop.
          //
          let iotInitializeResource = new cdk.CustomResource(this, "iot_static_init_resource", {
            serviceToken: this.iotSetupLambda.functionArn,
            resourceType: "Custom::simpleiot_static_init_resource",
            properties: {
                'Namespace': props.prefix,
                'Action': 'initialize',
                'Name': 'monitor',
                'Uuid': props.uuid,
                'CertsInSSM': true,
                'CertsInline': false,
                'Stage': props.stage,
                'LogLevel': props.logLevel
            }
        })
        let response = iotInitializeResource.getAtt("Response");
        //console.log("Got response from IOT Lambda initialization: " + this.initResponse);

        this.initResponse = response.toString()

        if (this.initResponse) {
            try {
                let iotResponse = JSON.parse(this.initResponse);
                console.log("Got response from IOT custom create: " + this.initResponse);
                this.iotMonitorEndpoint = iotResponse['iot_endpoint']
                this.iotCertKeyName = iotResponse['iot_certkeyname']
                this.iotPrivateKeyName = iotResponse['iot_privatekeyname']
                this.iotMonitorPolicyName = iotResponse['policy_name']

                // NOTE NOTE NOTE: in dev mode these settings should be saved in a database so the next
                // team member who comes to play gets them downloaded to their system so they can access
                // IOT certs, etc. We could move them to SecretsManager, but there is a 40K limit to
                // secrets and there's a risk we might run out.

            } catch (e) {
                // during build phase, parsing JSON can throw an exception, so we catch it and ignore it.
            }
         } else {
            this.iotMonitorEndpoint = "** invalid **";
            this.iotCertKeyName = "** invalid **";
            this. iotPrivateKeyName = "** invalid **";
            this.iotMonitorPolicyName = "** invalid **";
        }
      }
}
