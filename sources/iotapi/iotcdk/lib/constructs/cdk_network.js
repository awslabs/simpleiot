"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKNetwork = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const common_1 = require("./common");
const path = require("path");
class CDKNetwork extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
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
            service: aws_ec2_1.GatewayVpcEndpointAwsService.S3
        });
        this.vpc.addGatewayEndpoint("vpc_endpoint_dynamodb", {
            service: aws_ec2_1.GatewayVpcEndpointAwsService.DYNAMODB
        });
        // NOTE: cdk currently only supports S3 and DynamoDB as gateway endpoints.
        // the reset are interface endpoints which are tied to regions.
        // This may change in the future, and if network creation changes, it may
        // be because the service is not supported in that region.
        //
        this.vpc.addInterfaceEndpoint("vpc_endpoint_sqs", {
            service: aws_ec2_1.InterfaceVpcEndpointAwsService.SQS
        });
        this.vpc.addInterfaceEndpoint("vpc_endpoint_sns", {
            service: aws_ec2_1.InterfaceVpcEndpointAwsService.SNS
        });
        this.vpc.addInterfaceEndpoint("vpc_endpoint_ssm", {
            service: aws_ec2_1.InterfaceVpcEndpointAwsService.SSM
        });
        let vpcSecurityGroupName = props.prefix + "_vpc_secgrp";
        this.vpcSecurityGroup = new ec2.SecurityGroup(this, "vpc_security_group", {
            vpc: this.vpc,
            allowAllOutbound: false,
            securityGroupName: vpcSecurityGroupName
        });
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
exports.CDKNetwork = CDKNetwork;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX25ldHdvcmsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGtfbmV0d29yay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7OztFQUlFO0FBQ0YsbUNBQW1DO0FBRW5DLDJDQUEyQztBQUMzQyxpREFBd0g7QUFDeEgscUNBQWdDO0FBQ2hDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBRSxNQUFNLENBQUUsQ0FBQTtBQVk5QixNQUFhLFVBQVcsU0FBUSxHQUFHLENBQUMsV0FBVztJQUszQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQW9CO1FBRTFELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakIsZUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRWhDLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7UUFDbEMsMEJBQTBCO1FBQzFCLHlCQUF5QjtRQUN6Qiw4Q0FBOEM7UUFDOUMsS0FBSztTQUNSLENBQUMsQ0FBQztRQUVILDRDQUE0QztRQUM1QyxFQUFFO1FBQ0YsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBRTtZQUMzQyxPQUFPLEVBQUUsc0NBQTRCLENBQUMsRUFBRTtTQUMzQyxDQUFDLENBQUE7UUFDRixJQUFJLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixFQUFFO1lBQ2pELE9BQU8sRUFBRSxzQ0FBNEIsQ0FBQyxRQUFRO1NBQ2pELENBQUMsQ0FBQTtRQUNGLDBFQUEwRTtRQUMxRSwrREFBK0Q7UUFDL0QseUVBQXlFO1FBQ3pFLDBEQUEwRDtRQUMxRCxFQUFFO1FBQ0YsSUFBSSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxrQkFBa0IsRUFBRTtZQUM5QyxPQUFPLEVBQUUsd0NBQThCLENBQUMsR0FBRztTQUM5QyxDQUFDLENBQUE7UUFDRixJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGtCQUFrQixFQUFFO1lBQzlDLE9BQU8sRUFBRSx3Q0FBOEIsQ0FBQyxHQUFHO1NBQzlDLENBQUMsQ0FBQTtRQUNGLElBQUksQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsa0JBQWtCLEVBQUU7WUFDOUMsT0FBTyxFQUFFLHdDQUE4QixDQUFDLEdBQUc7U0FDOUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQztRQUN4RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN0RSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixnQkFBZ0IsRUFBRSxLQUFLO1lBQ3ZCLGlCQUFpQixFQUFFLG9CQUFvQjtTQUMxQyxDQUFDLENBQUE7UUFDRixpRUFBaUU7UUFDakUsRUFBRTtRQUNGLGdGQUFnRjtRQUVoRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUzRSx1RkFBdUY7UUFDdkYsdUJBQXVCO1FBQ3ZCLEVBQUU7UUFDRiw4RUFBOEU7SUFDbEYsQ0FBQztDQUNKO0FBMURELGdDQTBEQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCBlYzIgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtZWMyJylcbmltcG9ydCB7R2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZSwgSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLCBQZWVyLCBQb3J0LCBTdWJuZXRUeXBlfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjMlwiXG5pbXBvcnQge0NvbW1vbn0gZnJvbSBcIi4vY29tbW9uXCI7XG5jb25zdCBwYXRoID0gcmVxdWlyZSggXCJwYXRoXCIgKVxuXG4vLyBDb25zdHJ1Y3QgdG8gZWl0aGVyIGNyZWF0ZSBhIFZQQyBvciBsb2FkIGFuIGV4aXN0aW5nIG9uZS5cbi8vXG5cbmludGVyZmFjZSBJTmV0d29ya1Byb3BzIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrUHJvcHMge1xuICAgIHByZWZpeCA6IHN0cmluZyxcbiAgICB1dWlkOiBzdHJpbmcsXG4gICAgc3RhZ2U6IHN0cmluZyxcbiAgICB0YWdzOiB7W25hbWU6IHN0cmluZ106IGFueX1cbn1cblxuZXhwb3J0IGNsYXNzIENES05ldHdvcmsgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuXG4gICAgcHVibGljIHZwYzogZWMyLklWcGM7XG4gICAgcHVibGljIHZwY1NlY3VyaXR5R3JvdXA6IGVjMi5JU2VjdXJpdHlHcm91cDtcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJTmV0d29ya1Byb3BzKVxuICAgIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICAgICAgQ29tbW9uLmFkZFRhZ3ModGhpcywgcHJvcHMudGFncylcblxuICAgICAgICBsZXQgdnBjTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX3ZwY19cIjtcbiAgICAgICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCB2cGNOYW1lLCB7XG4gICAgICAgICAgICAvLyBzdWJuZXRDb25maWd1cmF0aW9uOiBbe1xuICAgICAgICAgICAgLy8gICAgIG5hbWU6ICdzaW1wbGVpb3QnLFxuICAgICAgICAgICAgLy8gICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRFxuICAgICAgICAgICAgLy8gfV1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWRkIHNlcnZpY2UgZW5kcG9pbnRzIHdlIG5lZWQgdG8gdGhlIFZQQy5cbiAgICAgICAgLy9cbiAgICAgICAgdGhpcy52cGMuYWRkR2F0ZXdheUVuZHBvaW50KFwidnBjX2VuZHBvaW50X3MzXCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IEdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzNcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy52cGMuYWRkR2F0ZXdheUVuZHBvaW50KFwidnBjX2VuZHBvaW50X2R5bmFtb2RiXCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IEdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuRFlOQU1PREJcbiAgICAgICAgfSlcbiAgICAgICAgLy8gTk9URTogY2RrIGN1cnJlbnRseSBvbmx5IHN1cHBvcnRzIFMzIGFuZCBEeW5hbW9EQiBhcyBnYXRld2F5IGVuZHBvaW50cy5cbiAgICAgICAgLy8gdGhlIHJlc2V0IGFyZSBpbnRlcmZhY2UgZW5kcG9pbnRzIHdoaWNoIGFyZSB0aWVkIHRvIHJlZ2lvbnMuXG4gICAgICAgIC8vIFRoaXMgbWF5IGNoYW5nZSBpbiB0aGUgZnV0dXJlLCBhbmQgaWYgbmV0d29yayBjcmVhdGlvbiBjaGFuZ2VzLCBpdCBtYXlcbiAgICAgICAgLy8gYmUgYmVjYXVzZSB0aGUgc2VydmljZSBpcyBub3Qgc3VwcG9ydGVkIGluIHRoYXQgcmVnaW9uLlxuICAgICAgICAvL1xuICAgICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludChcInZwY19lbmRwb2ludF9zcXNcIiwge1xuICAgICAgICAgICAgc2VydmljZTogSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNRU1xuICAgICAgICB9KVxuICAgICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludChcInZwY19lbmRwb2ludF9zbnNcIiwge1xuICAgICAgICAgICAgc2VydmljZTogSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNOU1xuICAgICAgICB9KVxuICAgICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludChcInZwY19lbmRwb2ludF9zc21cIiwge1xuICAgICAgICAgICAgc2VydmljZTogSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNTTVxuICAgICAgICB9KVxuXG4gICAgICAgIGxldCB2cGNTZWN1cml0eUdyb3VwTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX3ZwY19zZWNncnBcIjtcbiAgICAgICAgdGhpcy52cGNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsIFwidnBjX3NlY3VyaXR5X2dyb3VwXCIsIHtcbiAgICAgICAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBOYW1lOiB2cGNTZWN1cml0eUdyb3VwTmFtZVxuICAgICAgICB9KVxuICAgICAgICAvLyBUaGlzIGlzIGhvdyB5b3Ugd291bGQgbGltaXQgVlBDIGluZ3Jlc3MgZnJvbSBzcGVjaWZpYyBJUCByYW5nZVxuICAgICAgICAvL1xuICAgICAgICAvLyB0aGlzLnZwY1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5pcHY0KCcxMC4wLjAuMC8xNicpLCBQb3J0LnRjcCg4MCkpO1xuXG4gICAgICAgIHRoaXMudnBjU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShlYzIuUGVlci5hbnlJcHY0KCksIGVjMi5Qb3J0LnRjcCg4MCkpO1xuXG4gICAgICAgIC8vIElmIHlvdSBuZWVkIHRoZSBWUEMgb3BlbiwgdW5jb21tZW50IHRoZSBmb2xsb3dpbmcgbGluZSAobm90IHJlY29tbWVuZGVkIGJ1dCBwcm92aWRlZFxuICAgICAgICAvLyBoZXJlIGFzIGFuIGV4YW1wbGUpLlxuICAgICAgICAvL1xuICAgICAgICAvLyB0aGlzLnZwY1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC5hbGxUY3AoKSlcbiAgICB9XG59XG5cbiJdfQ==