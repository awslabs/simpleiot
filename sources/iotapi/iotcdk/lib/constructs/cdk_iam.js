"use strict";
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKIam = void 0;
const cdk = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const common_1 = require("./common");
class CDKIam extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // The IAM roles needed by IOT and lambda
        let groupName = props.prefix + '_iot_group_' + props.uuid;
        let userGroup = new iam.Group(this, "iot_iam_group", {
            groupName: groupName,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')
            ]
        });
        let policyName = props.prefix + "_iot_policy_" + props.uuid;
        let iotPolicy = new iam.Policy(this, "iot_iam_policy", {
            groups: [userGroup],
            policyName: policyName,
            statements: [
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
        });
    }
}
exports.CDKIam = CDKIam;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2lhbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNka19pYW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0VBSUU7OztBQUVGLG1DQUFtQztBQUVuQywyQ0FBMkM7QUFHM0MscUNBQWlDO0FBV2pDLE1BQWEsTUFBTyxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBS3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBZ0I7UUFFeEQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMseUNBQXlDO1FBRXpDLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsYUFBYSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUE7UUFDekQsSUFBSSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDakQsU0FBUyxFQUFFLFNBQVM7WUFDcEIsZUFBZSxFQUFHO2dCQUNkLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsZ0JBQWdCLENBQUM7YUFDL0Q7U0FDSixDQUFDLENBQUM7UUFFSCxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLGNBQWMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFBO1FBQzNELElBQUksU0FBUyxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDbkQsTUFBTSxFQUFHLENBQUUsU0FBUyxDQUFFO1lBQ3RCLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLFVBQVUsRUFBRztnQkFDVCxnQ0FBZ0M7Z0JBQ2hDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDcEIsT0FBTyxFQUFFLENBQUMsZUFBZSxFQUFFLGFBQWEsRUFBRSxhQUFhLENBQUM7b0JBQ3hELFNBQVMs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QW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IGlhbSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1pYW0nKVxuaW1wb3J0IGxhbWJkYSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnKVxuaW1wb3J0IGVjMiA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1lYzInKVxuaW1wb3J0IHsgQ29tbW9uIH0gZnJvbSAnLi9jb21tb24nXG5pbXBvcnQge0NES1RpbWVzdHJlYW19IGZyb20gXCIuL2Nka190aW1lc3RyZWFtXCI7XG5cblxuaW50ZXJmYWNlIElJYW1Qcm9wcyBleHRlbmRzIGNkay5OZXN0ZWRTdGFja1Byb3BzIHtcbiAgICBwcmVmaXg6IHN0cmluZyxcbiAgICBzdGFnZTogc3RyaW5nLFxuICAgIHV1aWQ6IHN0cmluZyxcbiAgICB0YWdzOiB7W25hbWU6IHN0cmluZ106IGFueX1cbn1cblxuZXhwb3J0IGNsYXNzIENES0lhbSBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG5cbiAgcHVibGljIGlvdExhbWJkYUZ1bGxBY2Nlc3NSb2xlOiBpYW0uUm9sZTtcblxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJSWFtUHJvcHMpXG4gIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIENvbW1vbi5hZGRUYWdzKHRoaXMsIHByb3BzLnRhZ3MpXG5cbiAgICAvLyBUaGUgSUFNIHJvbGVzIG5lZWRlZCBieSBJT1QgYW5kIGxhbWJkYVxuXG4gICAgbGV0IGdyb3VwTmFtZSA9IHByb3BzLnByZWZpeCArICdfaW90X2dyb3VwXycgKyBwcm9wcy51dWlkXG4gICAgbGV0IHVzZXJHcm91cCA9IG5ldyBpYW0uR3JvdXAodGhpcywgXCJpb3RfaWFtX2dyb3VwXCIsIHtcbiAgICAgICAgZ3JvdXBOYW1lOiBncm91cE5hbWUsXG4gICAgICAgIG1hbmFnZWRQb2xpY2llcyA6IFtcbiAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnUmVhZE9ubHlBY2Nlc3MnKVxuICAgICAgICBdXG4gICAgfSk7XG5cbiAgICBsZXQgcG9saWN5TmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2lvdF9wb2xpY3lfXCIgKyBwcm9wcy51dWlkXG4gICAgbGV0IGlvdFBvbGljeSA9IG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiaW90X2lhbV9wb2xpY3lcIiwge1xuICAgICAgICBncm91cHMgOiBbIHVzZXJHcm91cCBdLFxuICAgICAgICBwb2xpY3lOYW1lOiBwb2xpY3lOYW1lLFxuICAgICAgICBzdGF0ZW1lbnRzIDogW1xuICAgICAgICAgICAgLy8gQWxsb3cgYWNjZXNzIHRvIE1RVFQgbWVzc2FnZXNcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXCJpb3Q6U3Vic2NyaWJlXCIsIFwiaW90OkNvbm5lY3RcIiwgXCJpb3Q6UmVjZWl2ZVwiXSxcbiAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIF1cbiAgICB9KTtcblxuICAgIGxldCByb2xlTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2lvdF9sYW1iZGFfZnVsbF9yb2xlX1wiICsgcHJvcHMudXVpZDtcblxuICAgIHRoaXMuaW90TGFtYmRhRnVsbEFjY2Vzc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJpb3RfaWFtX2Z1bGxfcm9sZVwiLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICAgIHJvbGVOYW1lOiByb2xlTmFtZSxcbiAgICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgICAgICdmdWxsX2FjY2Vzc19yb2xlJzogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlYzI6RGVzY3JpYmVOZXR3b3JrSW50ZXJmYWNlc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWMyOkNyZWF0ZU5ldHdvcmtJbnRlcmZhY2VcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjMjpEZWxldGVOZXR3b3JrSW50ZXJmYWNlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlYzI6RGVzY3JpYmVJbnN0YW5jZXNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjMjpBdHRhY2hOZXR3b3JrSW50ZXJmYWNlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxvZ3M6Q3JlYXRlTG9nR3JvdXBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxvZ3M6Q3JlYXRlTG9nU3RyZWFtXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsb2dzOlB1dExvZ0V2ZW50c1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiYXJuOmF3czpsb2dzOio6KjoqXCJdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0aW1lc3RyZWFtOldyaXRlUmVjb3Jkc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidGltZXN0cmVhbTpEZXNjcmliZUVuZHBvaW50c1wiXG4gICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzZWNyZXRzbWFuYWdlcjpHZXRSZXNvdXJjZVBvbGljeVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwic2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNlY3JldHNtYW5hZ2VyOkRlc2NyaWJlU2VjcmV0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzZWNyZXRzbWFuYWdlcjpMaXN0U2VjcmV0VmVyc2lvbklkc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwic2VjcmV0c21hbmFnZXI6RGVsZXRlU2VjcmV0XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNzbTpQdXRQYXJhbWV0ZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNzbTpHZXRQYXJhbWV0ZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNzbTpHZXRQYXJhbWV0ZXJzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzc206RGVsZXRlUGFyYW1ldGVyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzc206RGVsZXRlUGFyYW1ldGVyc1wiXG4gICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJpb3Q6KlwiXG4gICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJrbXM6RGVjcnlwdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwia21zOkVuY3J5cHRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImttczpHZW5lcmF0ZURhdGFLZXlcIlxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibGFtYmRhOmludm9rZUZ1bmN0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsYW1iZGE6aW52b2tlQXN5bmNcIlxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiaWFtOlBhc3NSb2xlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxuICB9XG59XG4iXX0=