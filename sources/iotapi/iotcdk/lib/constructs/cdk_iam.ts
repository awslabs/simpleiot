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


interface IIamProps extends cdk.NestedStackProps {
    prefix: string,
    stage: string,
    uuid: string,
    tags: {[name: string]: any}
}

export class CDKIam extends cdk.NestedStack {

  public iotLambdaFullAccessRole: iam.Role;


  constructor(scope: Construct, id: string, props: IIamProps)
  {
    super(scope, id);
    Common.addTags(this, props.tags)

    // The IAM roles needed by IOT and lambda

    let groupName = props.prefix + '_iot_group_' + props.uuid
    let userGroup = new iam.Group(this, "iot_iam_group", {
        groupName: groupName,
        managedPolicies : [
            iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')
        ]
    });

    let policyName = props.prefix + "_iot_policy_" + props.uuid
    let iotPolicy = new iam.Policy(this, "iot_iam_policy", {
        groups : [ userGroup ],
        policyName: policyName,
        statements : [
            // Allow access to MQTT messages
            new iam.PolicyStatement({
                actions: ["iot:Subscribe", "iot:Connect", "iot:Receive"],
                resources: ["*"]
            })
        ]
    });

    let roleName = props.prefix + "_iot_lambda_full_role_" + props.uuid;

    this.iotLambdaFullAccessRole = new iam.Role(this, "iot_iam_full_role", {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        roleName: roleName,
        inlinePolicies: {
            'full_access_role': new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        actions: [
                            "ec2:DescribeNetworkInterfaces",
                            "ec2:CreateNetworkInterface",
                            "ec2:DeleteNetworkInterface",
                            "ec2:DescribeInstances",
                            "ec2:AttachNetworkInterface"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "logs:CreateLogGroup",
                            "logs:CreateLogStream",
                            "logs:PutLogEvents",
                        ],
                        resources: ["arn:aws:logs:*:*:*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "timestream:WriteRecords",
                            "timestream:DescribeEndpoints"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "secretsmanager:GetResourcePolicy",
                            "secretsmanager:GetSecretValue",
                            "secretsmanager:DescribeSecret",
                            "secretsmanager:ListSecretVersionIds",
                            "secretsmanager:DeleteSecret"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "ssm:PutParameter",
                            "ssm:GetParameter",
                            "ssm:GetParameters",
                            "ssm:DeleteParameter",
                            "ssm:DeleteParameters"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "iot:*"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "kms:Decrypt",
                            "kms:Encrypt",
                            "kms:GenerateDataKey"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "lambda:invokeFunction",
                            "lambda:invokeAsync"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "sts:AssumeRole"
                        ],
                        resources: ["*"]
                    }),
                    new iam.PolicyStatement({
                        actions: [
                            "iam:PassRole"
                        ],
                        resources: ["*"]
                    })

                ]
            })
        }
    })
  }
}
