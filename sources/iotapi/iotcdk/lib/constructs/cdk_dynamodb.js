"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKDynamoDB = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
const cdk = require("aws-cdk-lib");
const ddb = require("aws-cdk-lib/aws-dynamodb");
const common_1 = require("./common");
;
class CDKDynamoDB extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
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
exports.CDKDynamoDB = CDKDynamoDB;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2R5bmFtb2RiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX2R5bmFtb2RiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0VBSUU7QUFDRixtQ0FBbUM7QUFHbkMsZ0RBQWlEO0FBRWpELHFDQUErQjtBQVU5QixDQUFDO0FBR0YsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLFdBQVc7SUFHNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFxQjtRQUMzRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLGVBQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUVoQyx3RUFBd0U7UUFFeEUsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsR0FBRyxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNuRCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFFekQ7OztlQUdHO1lBQ0gsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxJQUFJO2dCQUNWLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDL0I7WUFDRCxPQUFPLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLGFBQWE7Z0JBQ25CLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDL0I7WUFDRCxXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQzVDLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDekMsQ0FBQyxDQUFDO1FBR0gsNkVBQTZFO1FBQzdFLG1GQUFtRjtRQUNuRixLQUFLO1FBQ0wsd0VBQXdFO1FBQ3hFLHNCQUFzQjtRQUN0QixxQkFBcUI7UUFDckIsTUFBTTtRQUNOLEVBQUU7UUFDRix5Q0FBeUM7UUFDekMsS0FBSztRQUNMLHdDQUF3QztRQUN4QyxtQ0FBbUM7UUFDbkMsTUFBTTtJQUNWLENBQUM7Q0FDSjtBQTNDRCxrQ0EyQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKiDCqSAyMDIyIEFtYXpvbiBXZWIgU2VydmljZXMsIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogU2ltcGxlSU9UIHByb2plY3QuXG4gKiBBdXRob3I6IFJhbWluIEZpcm9venllIChmcmFtaW5AYW1hem9uLmNvbSlcbiovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgZWMyID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWVjMicpXG5pbXBvcnQgZGRiID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJyk7XG5pbXBvcnQgaWFtID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWlhbScpXG5pbXBvcnQge0NvbW1vbn0gZnJvbSBcIi4vY29tbW9uXCJcbmltcG9ydCAqIGFzIGFwcGF1dG9zY2FsaW5nIGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcHBsaWNhdGlvbmF1dG9zY2FsaW5nJztcblxuXG5pbnRlcmZhY2UgSUR5bmFtb0RCUHJvcHMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2tQcm9wcyB7XG4gICAgcHJlZml4OiBzdHJpbmcsXG4gICAgdXVpZDogc3RyaW5nLFxuICAgIHZwYzogZWMyLklWcGMsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59O1xuXG5cbmV4cG9ydCBjbGFzcyBDREtEeW5hbW9EQiBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG4gICAgcHVibGljIGR5bmFtb0RCVGFibGU6IGRkYi5UYWJsZTtcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJRHluYW1vREJQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgICAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiRXhlY3V0aW5nOiBEeW5hbW9EQiBzdGFjayB3aXRoIHByZWZpeDogXCIgKyBwcm9wcy5wcmVmaXgpXG5cbiAgICAgICAgbGV0IHRhYmxlTmFtZSA9IHByb3BzLnRhYmxlTmFtZSArIFwiLVwiICsgcHJvcHMudXVpZDtcbiAgICAgICAgdGhpcy5keW5hbW9EQlRhYmxlID0gbmV3IGRkYi5UYWJsZSh0aGlzLCAnZHluYW1vZGJfdGFibGUnLCB7XG5cbiAgICAgICAgICAvKiBOT1RFOiB0aGUgcGFydGl0aW9uIGtleSBpcyBnb2luZyB0byBiZSBhIHVuaXF1ZSBrZXkgc3ludGhlc2l6ZWQgYXQgcnVudGltZSBmcm9tIHRoZVxuICAgICAgICAgICAgIHByb2plY3Q6c2VyaWFsOnZhcmlhYmxlLW5hbWUgdmFsdWUuIFRoZSBzb3J0IGtleSB3aWxsIGJlIGEgdGltZXN0YW1wIHRoYXQgd2UgZ2VuZXJhdGUgYXQgcnVudGltZVxuICAgICAgICAgICAgIGVhY2ggdGltZSBhIHZhbHVlIGlzIHJlY2VpdmVkLiBUaGlzIHdpbGwgbWFrZSBzdXJlIGFsbCB2YWx1ZXMgYXJlIHN0b3JlZCBwcm9wZXJseSB3aXRoIGEgdGltZXN0YW1wLlxuICAgICAgICAgICAqL1xuICAgICAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICAgICAgbmFtZTogXCJpZFwiLFxuICAgICAgICAgICAgdHlwZTogZGRiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzb3J0S2V5OiB7XG4gICAgICAgICAgICBuYW1lOiAncmVjb3JkZWRfYXQnLFxuICAgICAgICAgICAgdHlwZTogZGRiLkF0dHJpYnV0ZVR5cGUuTlVNQkVSXG4gICAgICAgICAgfSxcbiAgICAgICAgICBiaWxsaW5nTW9kZTogZGRiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgLy8gLy8gU2V0IHVwIGF1dG8tc2NhbGluZy4gTWFrZSBzdXJlIHRvIG1vZGlmeSB0aGlzIHdoZW4gZ29pbmcgdG8gcHJvZHVjdGlvbi5cbiAgICAgICAgLy8gLy8gTk9URTogbm90IGF2YWlsYWJsZSBmb3IgUEFZX1BFUl9SRVFVRVNULiBUaGlzIGlzIGluY2x1ZGVkIGhlcmUgYXMgYW4gZXhhbXBsZS5cbiAgICAgICAgLy8gLy9cbiAgICAgICAgLy8gY29uc3Qgd3JpdGVBdXRvU2NhbGluZyA9IHRoaXMuZHluYW1vREJUYWJsZSAuYXV0b1NjYWxlV3JpdGVDYXBhY2l0eSh7XG4gICAgICAgIC8vICAgICBtaW5DYXBhY2l0eTogMSxcbiAgICAgICAgLy8gICAgIG1heENhcGFjaXR5OiAyXG4gICAgICAgIC8vIH0pO1xuICAgICAgICAvL1xuICAgICAgICAvLyAvLyBTY2FsZSB1cCB3aGVuIHdyaXRlIGNhcGFjaXR5IGhpdHMgJVxuICAgICAgICAvLyAvL1xuICAgICAgICAvLyB3cml0ZUF1dG9TY2FsaW5nLnNjYWxlT25VdGlsaXphdGlvbih7XG4gICAgICAgIC8vICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDgwXG4gICAgICAgIC8vIH0pO1xuICAgIH1cbn1cbiJdfQ==