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
        let vpcName = props.prefix + "_vpc_" + props.uuid;
        let privateSubnetName = props.prefix + "_iotprv_" + props.uuid;
        let publicSubnetName = props.prefix + "_iotpub_" + props.uuid;
        this.vpc = new ec2.Vpc(this, vpcName, {
            subnetConfiguration: [{
                    name: privateSubnetName,
                    subnetType: aws_ec2_1.SubnetType.PRIVATE_WITH_NAT
                },
                {
                    name: publicSubnetName,
                    subnetType: aws_ec2_1.SubnetType.PUBLIC
                }
            ]
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX25ldHdvcmsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGtfbmV0d29yay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7OztFQUlFO0FBQ0YsbUNBQW1DO0FBRW5DLDJDQUEyQztBQUMzQyxpREFBd0g7QUFDeEgscUNBQWdDO0FBQ2hDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBRSxNQUFNLENBQUUsQ0FBQTtBQVk5QixNQUFhLFVBQVcsU0FBUSxHQUFHLENBQUMsV0FBVztJQUszQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQW9CO1FBRTFELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakIsZUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRWhDLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbEQsSUFBSSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQy9ELElBQUksZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxVQUFVLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUM5RCxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQ2xDLG1CQUFtQixFQUFFLENBQUM7b0JBQ2xCLElBQUksRUFBRSxpQkFBaUI7b0JBQ3ZCLFVBQVUsRUFBRSxvQkFBVSxDQUFDLGdCQUFnQjtpQkFDMUM7Z0JBQ0Q7b0JBQ0ksSUFBSSxFQUFFLGdCQUFnQjtvQkFDdEIsVUFBVSxFQUFFLG9CQUFVLENBQUMsTUFBTTtpQkFDaEM7YUFDQTtTQUNKLENBQUMsQ0FBQztRQUVILDRDQUE0QztRQUM1QyxFQUFFO1FBQ0YsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBRTtZQUMzQyxPQUFPLEVBQUUsc0NBQTRCLENBQUMsRUFBRTtTQUMzQyxDQUFDLENBQUE7UUFDRixJQUFJLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixFQUFFO1lBQ2pELE9BQU8sRUFBRSxzQ0FBNEIsQ0FBQyxRQUFRO1NBQ2pELENBQUMsQ0FBQTtRQUNGLDBFQUEwRTtRQUMxRSwrREFBK0Q7UUFDL0QseUVBQXlFO1FBQ3pFLDBEQUEwRDtRQUMxRCxFQUFFO1FBQ0YsSUFBSSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxrQkFBa0IsRUFBRTtZQUM5QyxPQUFPLEVBQUUsd0NBQThCLENBQUMsR0FBRztTQUM5QyxDQUFDLENBQUE7UUFDRixJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGtCQUFrQixFQUFFO1lBQzlDLE9BQU8sRUFBRSx3Q0FBOEIsQ0FBQyxHQUFHO1NBQzlDLENBQUMsQ0FBQTtRQUNGLElBQUksQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsa0JBQWtCLEVBQUU7WUFDOUMsT0FBTyxFQUFFLHdDQUE4QixDQUFDLEdBQUc7U0FDOUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQztRQUN4RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN0RSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixnQkFBZ0IsRUFBRSxLQUFLO1lBQ3ZCLGlCQUFpQixFQUFFLG9CQUFvQjtTQUMxQyxDQUFDLENBQUE7UUFDRixpRUFBaUU7UUFDakUsRUFBRTtRQUNGLGdGQUFnRjtRQUVoRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUzRSx1RkFBdUY7UUFDdkYsdUJBQXVCO1FBQ3ZCLEVBQUU7UUFDRiw4RUFBOEU7SUFDbEYsQ0FBQztDQUNKO0FBakVELGdDQWlFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCBlYzIgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtZWMyJylcbmltcG9ydCB7R2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZSwgSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLCBQZWVyLCBQb3J0LCBTdWJuZXRUeXBlfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjMlwiXG5pbXBvcnQge0NvbW1vbn0gZnJvbSBcIi4vY29tbW9uXCI7XG5jb25zdCBwYXRoID0gcmVxdWlyZSggXCJwYXRoXCIgKVxuXG4vLyBDb25zdHJ1Y3QgdG8gZWl0aGVyIGNyZWF0ZSBhIFZQQyBvciBsb2FkIGFuIGV4aXN0aW5nIG9uZS5cbi8vXG5cbmludGVyZmFjZSBJTmV0d29ya1Byb3BzIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrUHJvcHMge1xuICAgIHByZWZpeCA6IHN0cmluZyxcbiAgICB1dWlkOiBzdHJpbmcsXG4gICAgc3RhZ2U6IHN0cmluZyxcbiAgICB0YWdzOiB7W25hbWU6IHN0cmluZ106IGFueX1cbn1cblxuZXhwb3J0IGNsYXNzIENES05ldHdvcmsgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuXG4gICAgcHVibGljIHZwYzogZWMyLklWcGM7XG4gICAgcHVibGljIHZwY1NlY3VyaXR5R3JvdXA6IGVjMi5JU2VjdXJpdHlHcm91cDtcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJTmV0d29ya1Byb3BzKVxuICAgIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICAgICAgQ29tbW9uLmFkZFRhZ3ModGhpcywgcHJvcHMudGFncylcblxuICAgICAgICBsZXQgdnBjTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX3ZwY19cIiArIHByb3BzLnV1aWQ7XG4gICAgICAgIGxldCBwcml2YXRlU3VibmV0TmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2lvdHBydl9cIiArIHByb3BzLnV1aWQ7XG4gICAgICAgIGxldCBwdWJsaWNTdWJuZXROYW1lID0gcHJvcHMucHJlZml4ICsgXCJfaW90cHViX1wiICsgcHJvcHMudXVpZDtcbiAgICAgICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCB2cGNOYW1lLCB7XG4gICAgICAgICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbe1xuICAgICAgICAgICAgICAgIG5hbWU6IHByaXZhdGVTdWJuZXROYW1lLFxuICAgICAgICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX05BVFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiBwdWJsaWNTdWJuZXROYW1lLFxuICAgICAgICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFVCTElDXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCBzZXJ2aWNlIGVuZHBvaW50cyB3ZSBuZWVkIHRvIHRoZSBWUEMuXG4gICAgICAgIC8vXG4gICAgICAgIHRoaXMudnBjLmFkZEdhdGV3YXlFbmRwb2ludChcInZwY19lbmRwb2ludF9zM1wiLCB7XG4gICAgICAgICAgICBzZXJ2aWNlOiBHYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMudnBjLmFkZEdhdGV3YXlFbmRwb2ludChcInZwY19lbmRwb2ludF9keW5hbW9kYlwiLCB7XG4gICAgICAgICAgICBzZXJ2aWNlOiBHYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkRZTkFNT0RCXG4gICAgICAgIH0pXG4gICAgICAgIC8vIE5PVEU6IGNkayBjdXJyZW50bHkgb25seSBzdXBwb3J0cyBTMyBhbmQgRHluYW1vREIgYXMgZ2F0ZXdheSBlbmRwb2ludHMuXG4gICAgICAgIC8vIHRoZSByZXNldCBhcmUgaW50ZXJmYWNlIGVuZHBvaW50cyB3aGljaCBhcmUgdGllZCB0byByZWdpb25zLlxuICAgICAgICAvLyBUaGlzIG1heSBjaGFuZ2UgaW4gdGhlIGZ1dHVyZSwgYW5kIGlmIG5ldHdvcmsgY3JlYXRpb24gY2hhbmdlcywgaXQgbWF5XG4gICAgICAgIC8vIGJlIGJlY2F1c2UgdGhlIHNlcnZpY2UgaXMgbm90IHN1cHBvcnRlZCBpbiB0aGF0IHJlZ2lvbi5cbiAgICAgICAgLy9cbiAgICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoXCJ2cGNfZW5kcG9pbnRfc3FzXCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IEludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TUVNcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoXCJ2cGNfZW5kcG9pbnRfc25zXCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IEludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TTlNcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoXCJ2cGNfZW5kcG9pbnRfc3NtXCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IEludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TU01cbiAgICAgICAgfSlcblxuICAgICAgICBsZXQgdnBjU2VjdXJpdHlHcm91cE5hbWUgPSBwcm9wcy5wcmVmaXggKyBcIl92cGNfc2VjZ3JwXCI7XG4gICAgICAgIHRoaXMudnBjU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcInZwY19zZWN1cml0eV9ncm91cFwiLCB7XG4gICAgICAgICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwTmFtZTogdnBjU2VjdXJpdHlHcm91cE5hbWVcbiAgICAgICAgfSlcbiAgICAgICAgLy8gVGhpcyBpcyBob3cgeW91IHdvdWxkIGxpbWl0IFZQQyBpbmdyZXNzIGZyb20gc3BlY2lmaWMgSVAgcmFuZ2VcbiAgICAgICAgLy9cbiAgICAgICAgLy8gdGhpcy52cGNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuaXB2NCgnMTAuMC4wLjAvMTYnKSwgUG9ydC50Y3AoODApKTtcblxuICAgICAgICB0aGlzLnZwY1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AoODApKTtcblxuICAgICAgICAvLyBJZiB5b3UgbmVlZCB0aGUgVlBDIG9wZW4sIHVuY29tbWVudCB0aGUgZm9sbG93aW5nIGxpbmUgKG5vdCByZWNvbW1lbmRlZCBidXQgcHJvdmlkZWRcbiAgICAgICAgLy8gaGVyZSBhcyBhbiBleGFtcGxlKS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gdGhpcy52cGNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKGVjMi5QZWVyLmFueUlwdjQoKSwgZWMyLlBvcnQuYWxsVGNwKCkpXG4gICAgfVxufVxuXG4iXX0=