"use strict";
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKCognito = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const common_1 = require("./common");
class CDKCognito extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // If we are using SSO, we don't bother creating a Cognito user pool, but we still create
        // an identity pool for IOT devices.
        //
        if (!props.useSSO) {
            this.userPoolName = props.prefix + "_user_pool_" + props.uuid;
            // console.log("Creating User Pool:" + this.userPoolName)
            // NOTE: we need to explicitly mark the userpool removal policy so it gets cleaned
            // up when deleting the stack. Default is to retain it so we end up with a lot of
            // userpools during development/testing.
            //
            this.userPool = new cognito.UserPool(this, "cognito_user_pool", {
                userPoolName: this.userPoolName,
                removalPolicy: cdk.RemovalPolicy.DESTROY
            });
            //
            // Set the advancedSecurityMode to ENFORCED
            //
            const cfnUserPool = this.userPool.node.findChild('Resource');
            cfnUserPool.userPoolAddOns = {
                advancedSecurityMode: 'ENFORCED'
            };
            let userPoolclientName = props.prefix + "_userpool_client_" + props.uuid;
            // console.log("Creating User Pool Client:" + userPoolclientName)
            this.userPoolClient = this.userPool.addClient("cognito_userpool_client", {
                oAuth: {
                    flows: {
                        implicitCodeGrant: true
                    },
                    callbackUrls: [
                        'http://localhost:8000/home',
                        'http://localhost:8000/users'
                    ]
                },
                userPoolClientName: userPoolclientName,
                authFlows: {
                    userSrp: true,
                    adminUserPassword: true,
                    userPassword: true,
                    custom: true
                }
            });
            let domain_name = "simpleiot-" + props.uuid;
            this.domain = this.userPool.addDomain('cognito_domain', {
                cognitoDomain: {
                    domainPrefix: domain_name
                }
            });
            this.signInUrl = this.domain.signInUrl(this.userPoolClient, {
                redirectUri: 'https://localhost:8000/home' // must be URL configured above in callbacks
            });
            this.clientId = this.userPoolClient.userPoolClientId;
        }
        this.identityPoolName = props.prefix + "_identity_pool_" + props.uuid;
        // Need to make the userpool be an identity provider for the identity pool so
        // we can login from the gateway and get temporary access_key and secret_key values
        // to provision Greengrass v2 devices.
        //
        this.identityPool = new cognito.CfnIdentityPool(this, "cognito_identity_pool", {
            identityPoolName: this.identityPoolName,
            allowUnauthenticatedIdentities: true,
            cognitoIdentityProviders: [{
                    clientId: this.userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
                }],
        });
        // Now we attach the auth/unauth role to the identity pool
        //
        let unauthRoleName = props.prefix + "_unauth_role_" + props.uuid;
        this.unauthRole = new iam.Role(this, "cognito_unauth_role", {
            roleName: unauthRoleName,
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {}, "sts:AssumeRoleWithWebIdentity")
        });
        this.unauthRole.attachInlinePolicy(new iam.Policy(this, "cognito_unauth_policy", {
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        "mobileanalytics:PutEvents",
                        "cognito-sync:*",
                    ],
                    resources: ["*"]
                }),
                new iam.PolicyStatement({
                    actions: ["iot:*"],
                    resources: ["*"]
                }),
                /* To allow access by maps */
                new iam.PolicyStatement({
                    actions: ["geo:GetMapStyleDescriptor",
                        "geo:GetMapGlyphs",
                        "geo:GetMapSprites",
                        "geo:GetMapTile"],
                    resources: ["*"]
                })
            ]
        }));
        let authRoleName = props.prefix + "_auth_role_" + props.uuid;
        this.authRole = new iam.Role(this, "cognito_auth_role", {
            roleName: authRoleName,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonESCognitoAccess")
            ],
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {}, "sts:AssumeRoleWithWebIdentity")
        });
        // Need to allow greengrass access to allow on-device provisioning of gateways using
        // login credentials.
        //
        this.authRole.attachInlinePolicy(new iam.Policy(this, "cognito_auth_policy", {
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        "mobileanalytics:PutEvents",
                        "cognito-sync:*",
                        "execute-api:*"
                    ],
                    resources: ["*"]
                }),
                new iam.PolicyStatement({
                    actions: ["iot:*", "greengrass:*"],
                    resources: ["*"]
                })
            ]
        }));
        // These should be preserved somewhere permanent so they could be
        // auto-inserted into the dashboard. As it stands, these values
        // have to be manually transferred over to the dashboard, where
        // it has to be rebuilt and pushed out to S3.
        //
        new cognito.CfnIdentityPoolRoleAttachment(this, "cognito_identity_pool_role_attachment", {
            identityPoolId: this.identityPool.ref,
            roles: {
                "authenticated": this.authRole.roleArn,
                "unauthenticated": this.unauthRole.roleArn
            }
        });
    }
}
exports.CDKCognito = CDKCognito;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2NvZ25pdG8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGtfY29nbml0by50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7RUFJRTs7O0FBRUYsbUNBQW1DO0FBRW5DLG1EQUFvRDtBQUNwRCwyQ0FBMkM7QUFDM0MscUNBQWlDO0FBVWpDLE1BQWEsVUFBVyxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBYTdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFFMUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMseUZBQXlGO1FBQ3pGLG9DQUFvQztRQUNwQyxFQUFFO1FBQ0YsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUU7WUFDZixJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsYUFBYSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUE7WUFDN0QseURBQXlEO1lBRXpELGtGQUFrRjtZQUNsRixpRkFBaUY7WUFDakYsd0NBQXdDO1lBQ3hDLEVBQUU7WUFDRixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQzFEO2dCQUNJLFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWTtnQkFDL0IsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTzthQUMzQyxDQUFDLENBQUM7WUFDUCxFQUFFO1lBQ0YsMkNBQTJDO1lBQzNDLEVBQUU7WUFDRixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUF3QixDQUFDO1lBQ3BGLFdBQVcsQ0FBQyxjQUFjLEdBQUc7Z0JBQ3ZCLG9CQUFvQixFQUFFLFVBQVU7YUFDckMsQ0FBQztZQUVGLElBQUks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QzthQUNMO1NBQ0osQ0FDQSxDQUNKLENBQUE7UUFFRCxpRUFBaUU7UUFDakUsK0RBQStEO1FBQy9ELCtEQUErRDtRQUMvRCw2Q0FBNkM7UUFDN0MsRUFBRTtRQUNGLElBQUksT0FBTyxDQUFDLDZCQUE2QixDQUFDLElBQUksRUFDMUMsdUNBQXVDLEVBQUU7WUFDckMsY0FBYyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRztZQUNyQyxLQUFLLEVBQUU7Z0JBQ0gsZUFBZSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTztnQkFDdEMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPO2FBQzdDO1NBQ0osQ0FBQyxDQUFBO0lBQ1YsQ0FBQztDQUNGO0FBMUxELGdDQTBMQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IGNvZ25pdG8gPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtY29nbml0bycpO1xuaW1wb3J0IGlhbSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1pYW0nKVxuaW1wb3J0IHsgQ29tbW9uIH0gZnJvbSAnLi9jb21tb24nXG5cblxuaW50ZXJmYWNlIElDb2duaXRvUHJvcHMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2tQcm9wcyB7XG4gICAgdXNlU1NPOiBib29sZWFuLFxuICAgIHByZWZpeDogc3RyaW5nLFxuICAgIHV1aWQ6IHN0cmluZyxcbiAgICB0YWdzOiB7W25hbWU6IHN0cmluZ106IGFueX1cbn1cblxuZXhwb3J0IGNsYXNzIENES0NvZ25pdG8gZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuICAgIHB1YmxpYyB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgICBwdWJsaWMgaWRlbnRpdHlQb29sIDogY29nbml0by5DZm5JZGVudGl0eVBvb2w7XG4gICAgcHVibGljIGNsaWVudElkOiBzdHJpbmc7XG4gICAgcHVibGljIGlkZW50aXR5UG9vbElkOiBzdHJpbmc7XG4gICAgcHVibGljIGlkZW50aXR5UG9vbE5hbWU6IHN0cmluZztcbiAgICBwdWJsaWMgYXV0aFJvbGU6IGlhbS5Sb2xlO1xuICAgIHB1YmxpYyB1bmF1dGhSb2xlOiBpYW0uUm9sZTtcbiAgICBwdWJsaWMgdXNlclBvb2xOYW1lOiBzdHJpbmc7XG4gICAgcHVibGljIGRvbWFpbiA6IGNvZ25pdG8uVXNlclBvb2xEb21haW47XG4gICAgcHVibGljIHNpZ25JblVybCA6IHN0cmluZztcbiAgICBwdWJsaWMgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IElDb2duaXRvUHJvcHMpXG4gIHtcbiAgICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgICAvLyBJZiB3ZSBhcmUgdXNpbmcgU1NPLCB3ZSBkb24ndCBib3RoZXIgY3JlYXRpbmcgYSBDb2duaXRvIHVzZXIgcG9vbCwgYnV0IHdlIHN0aWxsIGNyZWF0ZVxuICAgICAgLy8gYW4gaWRlbnRpdHkgcG9vbCBmb3IgSU9UIGRldmljZXMuXG4gICAgICAvL1xuICAgICAgaWYgKCFwcm9wcy51c2VTU08pIHtcbiAgICAgICAgICB0aGlzLnVzZXJQb29sTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX3VzZXJfcG9vbF9cIiArIHByb3BzLnV1aWRcbiAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcIkNyZWF0aW5nIFVzZXIgUG9vbDpcIiArIHRoaXMudXNlclBvb2xOYW1lKVxuXG4gICAgICAgICAgLy8gTk9URTogd2UgbmVlZCB0byBleHBsaWNpdGx5IG1hcmsgdGhlIHVzZXJwb29sIHJlbW92YWwgcG9saWN5IHNvIGl0IGdldHMgY2xlYW5lZFxuICAgICAgICAgIC8vIHVwIHdoZW4gZGVsZXRpbmcgdGhlIHN0YWNrLiBEZWZhdWx0IGlzIHRvIHJldGFpbiBpdCBzbyB3ZSBlbmQgdXAgd2l0aCBhIGxvdCBvZlxuICAgICAgICAgIC8vIHVzZXJwb29scyBkdXJpbmcgZGV2ZWxvcG1lbnQvdGVzdGluZy5cbiAgICAgICAgICAvL1xuICAgICAgICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcImNvZ25pdG9fdXNlcl9wb29sXCIsXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIHVzZXJQb29sTmFtZTogdGhpcy51c2VyUG9vbE5hbWUsXG4gICAgICAgICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIC8vXG4gICAgICAgICAgLy8gU2V0IHRoZSBhZHZhbmNlZFNlY3VyaXR5TW9kZSB0byBFTkZPUkNFRFxuICAgICAgICAgIC8vXG4gICAgICAgICAgY29uc3QgY2ZuVXNlclBvb2wgPSB0aGlzLnVzZXJQb29sLm5vZGUuZmluZENoaWxkKCdSZXNvdXJjZScpIGFzIGNvZ25pdG8uQ2ZuVXNlclBvb2w7XG4gICAgICAgICAgY2ZuVXNlclBvb2wudXNlclBvb2xBZGRPbnMgPSB7XG4gICAgICAgICAgICAgICAgYWR2YW5jZWRTZWN1cml0eU1vZGU6ICdFTkZPUkNFRCdcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgbGV0IHVzZXJQb29sY2xpZW50TmFtZSA9IHByb3BzLnByZWZpeCArIFwiX3VzZXJwb29sX2NsaWVudF9cIiArIHByb3BzLnV1aWRcbiAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcIkNyZWF0aW5nIFVzZXIgUG9vbCBDbGllbnQ6XCIgKyB1c2VyUG9vbGNsaWVudE5hbWUpXG5cbiAgICAgICAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gdGhpcy51c2VyUG9vbC5hZGRDbGllbnQoXCJjb2duaXRvX3VzZXJwb29sX2NsaWVudFwiLCB7XG4gICAgICAgICAgICAgIG9BdXRoOiB7XG4gICAgICAgICAgICAgICAgICBmbG93czoge1xuICAgICAgICAgICAgICAgICAgICAgIGltcGxpY2l0Q29kZUdyYW50OiB0cnVlXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9ob21lJyxcbiAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDo4MDAwL3VzZXJzJ1xuICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB1c2VyUG9vbENsaWVudE5hbWU6IHVzZXJQb29sY2xpZW50TmFtZSxcbiAgICAgICAgICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgICAgICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICBjdXN0b206IHRydWVcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGV0IGRvbWFpbl9uYW1lID0gXCJzaW1wbGVpb3QtXCIgKyBwcm9wcy51dWlkO1xuICAgICAgICAgIHRoaXMuZG9tYWluID0gdGhpcy51c2VyUG9vbC5hZGREb21haW4oJ2NvZ25pdG9fZG9tYWluJywge1xuICAgICAgICAgICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgICAgICAgICAgICBkb21haW5QcmVmaXg6IGRvbWFpbl9uYW1lXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHRoaXMuc2lnbkluVXJsID0gdGhpcy5kb21haW4uc2lnbkluVXJsKHRoaXMudXNlclBvb2xDbGllbnQsIHtcbiAgICAgICAgICAgICAgcmVkaXJlY3RVcmk6ICdodHRwczovL2xvY2FsaG9zdDo4MDAwL2hvbWUnIC8vIG11c3QgYmUgVVJMIGNvbmZpZ3VyZWQgYWJvdmUgaW4gY2FsbGJhY2tzXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHRoaXMuY2xpZW50SWQgPSB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQ7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaWRlbnRpdHlQb29sTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2lkZW50aXR5X3Bvb2xfXCIgKyBwcm9wcy51dWlkXG5cbiAgICAgIC8vIE5lZWQgdG8gbWFrZSB0aGUgdXNlcnBvb2wgYmUgYW4gaWRlbnRpdHkgcHJvdmlkZXIgZm9yIHRoZSBpZGVudGl0eSBwb29sIHNvXG4gICAgICAvLyB3ZSBjYW4gbG9naW4gZnJvbSB0aGUgZ2F0ZXdheSBhbmQgZ2V0IHRlbXBvcmFyeSBhY2Nlc3Nfa2V5IGFuZCBzZWNyZXRfa2V5IHZhbHVlc1xuICAgICAgLy8gdG8gcHJvdmlzaW9uIEdyZWVuZ3Jhc3MgdjIgZGV2aWNlcy5cbiAgICAgIC8vXG4gICAgICB0aGlzLmlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbCh0aGlzLCBcImNvZ25pdG9faWRlbnRpdHlfcG9vbFwiLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgICAgaWRlbnRpdHlQb29sTmFtZTogdGhpcy5pZGVudGl0eVBvb2xOYW1lLFxuICAgICAgICAgICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IHRydWUsXG4gICAgICAgICAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW3tcbiAgICAgICAgICAgICAgICBjbGllbnRJZDogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgICAgICAgIHByb3ZpZGVyTmFtZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbFByb3ZpZGVyTmFtZSxcbiAgICAgICAgICAgICB9XSxcbiAgICAgICAgICB9XG4gICAgICApXG5cbiAgICAgIC8vIE5vdyB3ZSBhdHRhY2ggdGhlIGF1dGgvdW5hdXRoIHJvbGUgdG8gdGhlIGlkZW50aXR5IHBvb2xcbiAgICAgIC8vXG4gICAgICBsZXQgdW5hdXRoUm9sZU5hbWUgPSBwcm9wcy5wcmVmaXggKyBcIl91bmF1dGhfcm9sZV9cIisgcHJvcHMudXVpZFxuICAgICAgdGhpcy51bmF1dGhSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiY29nbml0b191bmF1dGhfcm9sZVwiLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcm9sZU5hbWU6IHVuYXV0aFJvbGVOYW1lLFxuICAgICAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAgICAgICAgICB7fSxcbiAgICAgICAgICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIilcbiAgICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICB0aGlzLnVuYXV0aFJvbGUuYXR0YWNoSW5saW5lUG9saWN5KG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiY29nbml0b191bmF1dGhfcG9saWN5XCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJjb2duaXRvLXN5bmM6KlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcImlvdDoqXCJdLFxuICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAvKiBUbyBhbGxvdyBhY2Nlc3MgYnkgbWFwcyAqL1xuICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcImdlbzpHZXRNYXBTdHlsZURlc2NyaXB0b3JcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86R2V0TWFwR2x5cGhzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkdldE1hcFNwcml0ZXNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86R2V0TWFwVGlsZVwiXSxcbiAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICApXG5cbiAgICAgIGxldCBhdXRoUm9sZU5hbWUgPSBwcm9wcy5wcmVmaXggKyBcIl9hdXRoX3JvbGVfXCIgKyBwcm9wcy51dWlkXG4gICAgICB0aGlzLmF1dGhSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiY29nbml0b19hdXRoX3JvbGVcIixcbiAgICAgICAgICB7XG4gICAgICAgICAgICAgIHJvbGVOYW1lOiBhdXRoUm9sZU5hbWUsXG4gICAgICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQW1hem9uRVNDb2duaXRvQWNjZXNzXCIpXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcbiAgICAgICAgICAgICAgICAgIHt9LFxuICAgICAgICAgICAgICAgICAgXCJzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eVwiKVxuICAgICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIE5lZWQgdG8gYWxsb3cgZ3JlZW5ncmFzcyBhY2Nlc3MgdG8gYWxsb3cgb24tZGV2aWNlIHByb3Zpc2lvbmluZyBvZiBnYXRld2F5cyB1c2luZ1xuICAgICAgLy8gbG9naW4gY3JlZGVudGlhbHMuXG4gICAgICAvL1xuICAgICAgdGhpcy5hdXRoUm9sZS5hdHRhY2hJbmxpbmVQb2xpY3kobmV3IGlhbS5Qb2xpY3kodGhpcywgXCJjb2duaXRvX2F1dGhfcG9saWN5XCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJjb2duaXRvLXN5bmM6KlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJleGVjdXRlLWFwaToqXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXCJpb3Q6KlwiLCBcImdyZWVuZ3Jhc3M6KlwiXSxcbiAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgICAgKVxuICAgICAgKVxuXG4gICAgICAvLyBUaGVzZSBzaG91bGQgYmUgcHJlc2VydmVkIHNvbWV3aGVyZSBwZXJtYW5lbnQgc28gdGhleSBjb3VsZCBiZVxuICAgICAgLy8gYXV0by1pbnNlcnRlZCBpbnRvIHRoZSBkYXNoYm9hcmQuIEFzIGl0IHN0YW5kcywgdGhlc2UgdmFsdWVzXG4gICAgICAvLyBoYXZlIHRvIGJlIG1hbnVhbGx5IHRyYW5zZmVycmVkIG92ZXIgdG8gdGhlIGRhc2hib2FyZCwgd2hlcmVcbiAgICAgIC8vIGl0IGhhcyB0byBiZSByZWJ1aWx0IGFuZCBwdXNoZWQgb3V0IHRvIFMzLlxuICAgICAgLy9cbiAgICAgIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KHRoaXMsXG4gICAgICAgICAgXCJjb2duaXRvX2lkZW50aXR5X3Bvb2xfcm9sZV9hdHRhY2htZW50XCIsIHtcbiAgICAgICAgICAgICAgaWRlbnRpdHlQb29sSWQ6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICAgICAgcm9sZXM6IHtcbiAgICAgICAgICAgICAgICAgIFwiYXV0aGVudGljYXRlZFwiOiB0aGlzLmF1dGhSb2xlLnJvbGVBcm4sXG4gICAgICAgICAgICAgICAgICBcInVuYXV0aGVudGljYXRlZFwiOiB0aGlzLnVuYXV0aFJvbGUucm9sZUFyblxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgfVxufVxuIl19