/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import ec2 = require('aws-cdk-lib/aws-ec2')
import {GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, Peer, Port, SubnetType} from "aws-cdk-lib/aws-ec2"
import {Common} from "./common";
const path = require( "path" )

// Construct to either create a VPC or load an existing one.
//

interface INetworkProps extends cdk.NestedStackProps {
    prefix : string,
    uuid: string,
    stage: string,
    tags: {[name: string]: any}
}

export class CDKNetwork extends cdk.NestedStack {

    public vpc: ec2.IVpc;
    public vpcSecurityGroup: ec2.ISecurityGroup;

    constructor(scope: Construct, id: string, props: INetworkProps)
    {
        super(scope, id);
        Common.addTags(this, props.tags)

        let vpcName = props.prefix + "_vpc_";
        this.vpc = new ec2.Vpc(this, vpcName, {
            // subnetConfiguration: [{
            //     name: 'simpleiot',
            //     subnetType: SubnetType.PRIVATE_ISOLATED
            // }]
        });

        // Add service endpoints we need to the VPC.
        //
        this.vpc.addGatewayEndpoint("vpc_endpoint_s3", {
            service: GatewayVpcEndpointAwsService.S3
        })
        this.vpc.addGatewayEndpoint("vpc_endpoint_dynamodb", {
            service: GatewayVpcEndpointAwsService.DYNAMODB
        })
        // NOTE: cdk currently only supports S3 and DynamoDB as gateway endpoints.
        // the reset are interface endpoints which are tied to regions.
        // This may change in the future, and if network creation changes, it may
        // be because the service is not supported in that region.
        //
        this.vpc.addInterfaceEndpoint("vpc_endpoint_sqs", {
            service: InterfaceVpcEndpointAwsService.SQS
        })
        this.vpc.addInterfaceEndpoint("vpc_endpoint_sns", {
            service: InterfaceVpcEndpointAwsService.SNS
        })
        this.vpc.addInterfaceEndpoint("vpc_endpoint_ssm", {
            service: InterfaceVpcEndpointAwsService.SSM
        })

        let vpcSecurityGroupName = props.prefix + "_vpc_secgrp";
        this.vpcSecurityGroup = new ec2.SecurityGroup(this, "vpc_security_group", {
            vpc: this.vpc,
            allowAllOutbound: false,
            securityGroupName: vpcSecurityGroupName
        })
        // This is how you would limit VPC ingress from specific IP range
        //
        // this.vpcSecurityGroup.addIngressRule(Peer.ipv4('10.0.0.0/16'), Port.tcp(80));

        this.vpcSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

        // If you need the VPC open, uncomment the following line (not recommended but provided
        // here as an example).
        //
        // this.vpcSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp())
    }
}

