/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import ec2 = require('aws-cdk-lib/aws-ec2')
import ddb = require('aws-cdk-lib/aws-dynamodb');
import iam = require('aws-cdk-lib/aws-iam')
import {Common} from "./common"
import * as appautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';


interface IDynamoDBProps extends cdk.NestedStackProps {
    prefix: string,
    uuid: string,
    vpc: ec2.IVpc,
    tableName: string,
    tags: {[name: string]: any}
};


export class CDKDynamoDB extends cdk.NestedStack {
    public dynamoDBTable: ddb.Table;

    constructor(scope: Construct, id: string, props: IDynamoDBProps) {
        super(scope, id);
        Common.addTags(this, props.tags)

        // console.log("Executing: DynamoDB stack with prefix: " + props.prefix)

        let tableName = props.tableName + "-" + props.uuid;
        this.dynamoDBTable = new ddb.Table(this, 'dynamodb_table', {

          /* NOTE: the partition key is going to be a unique key synthesized at runtime from the
             project:serial:variable-name value. The sort key will be a timestamp that we generate at runtime
             each time a value is received. This will make sure all values are stored properly with a timestamp.
           */
          partitionKey: {
            name: "id",
            type: ddb.AttributeType.STRING
          },
          sortKey: {
            name: 'recorded_at',
            type: ddb.AttributeType.NUMBER
          },
          billingMode: ddb.BillingMode.PAY_PER_REQUEST,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        });


        // // Set up auto-scaling. Make sure to modify this when going to production.
        // // NOTE: not available for PAY_PER_REQUEST. This is included here as an example.
        // //
        // const writeAutoScaling = this.dynamoDBTable .autoScaleWriteCapacity({
        //     minCapacity: 1,
        //     maxCapacity: 2
        // });
        //
        // // Scale up when write capacity hits %
        // //
        // writeAutoScaling.scaleOnUtilization({
        //     targetUtilizationPercent: 80
        // });
    }
}
