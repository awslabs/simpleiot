/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import cognito = require('aws-cdk-lib/aws-cognito');
import iam = require('aws-cdk-lib/aws-iam')
import { Common } from './common'


interface ICognitoProps extends cdk.NestedStackProps {
    useSSO: boolean,
    prefix: string,
    uuid: string,
    tags: {[name: string]: any}
}

export class CDKCognito extends cdk.NestedStack {
    public userPool: cognito.UserPool;
    public identityPool : cognito.CfnIdentityPool;
    public clientId: string;
    public identityPoolId: string;
    public identityPoolName: string;
    public authRole: iam.Role;
    public unauthRole: iam.Role;
    public userPoolName: string;
    public domain : cognito.UserPoolDomain;
    public signInUrl : string;
    public userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: ICognitoProps)
  {
      super(scope, id);
      Common.addTags(this, props.tags)

      // If we are using SSO, we don't bother creating a Cognito user pool, but we still create
      // an identity pool for IOT devices.
      //
      if (!props.useSSO) {
          this.userPoolName = props.prefix + "_user_pool_" + props.uuid
          // console.log("Creating User Pool:" + this.userPoolName)

          // NOTE: we need to explicitly mark the userpool removal policy so it gets cleaned
          // up when deleting the stack. Default is to retain it so we end up with a lot of
          // userpools during development/testing.
          //
          this.userPool = new cognito.UserPool(this, "cognito_user_pool",
              {
                  userPoolName: this.userPoolName,
                  removalPolicy: cdk.RemovalPolicy.DESTROY
              });
          //
          // Set the advancedSecurityMode to ENFORCED
          //
          const cfnUserPool = this.userPool.node.findChild('Resource') as cognito.CfnUserPool;
          cfnUserPool.userPoolAddOns = {
                advancedSecurityMode: 'ENFORCED'
          };

          let userPoolclientName = props.prefix + "_userpool_client_" + props.uuid
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
          })

          this.clientId = this.userPoolClient.userPoolClientId;
      }

      this.identityPoolName = props.prefix + "_identity_pool_" + props.uuid

      // Need to make the userpool be an identity provider for the identity pool so
      // we can login from the gateway and get temporary access_key and secret_key values
      // to provision Greengrass v2 devices.
      //
      this.identityPool = new cognito.CfnIdentityPool(this, "cognito_identity_pool",
          {
              identityPoolName: this.identityPoolName,
              allowUnauthenticatedIdentities: true,
              cognitoIdentityProviders: [{
                clientId: this.userPoolClient.userPoolClientId,
                providerName: this.userPool.userPoolProviderName,
             }],
          }
      )

      // Now we attach the auth/unauth role to the identity pool
      //
      let unauthRoleName = props.prefix + "_unauth_role_"+ props.uuid
      this.unauthRole = new iam.Role(this, "cognito_unauth_role",
          {
              roleName: unauthRoleName,
              assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com",
                  {},
                  "sts:AssumeRoleWithWebIdentity")
          }
      );

      this.unauthRole.attachInlinePolicy(new iam.Policy(this, "cognito_unauth_policy",
          {
              statements: [
                  new iam.PolicyStatement({
                          actions: [
                              "mobileanalytics:PutEvents",
                              "cognito-sync:*",
                          ],
                          resources: ["*"]
                      }
                  ),
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
            }
          )
      )

      let authRoleName = props.prefix + "_auth_role_" + props.uuid
      this.authRole = new iam.Role(this, "cognito_auth_role",
          {
              roleName: authRoleName,
              managedPolicies: [
                  iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonESCognitoAccess")
              ],
              assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com",
                  {},
                  "sts:AssumeRoleWithWebIdentity")
          }
      );

      // Need to allow greengrass access to allow on-device provisioning of gateways using
      // login credentials.
      //
      this.authRole.attachInlinePolicy(new iam.Policy(this, "cognito_auth_policy",
          {
              statements: [
                  new iam.PolicyStatement({
                          actions: [
                              "mobileanalytics:PutEvents",
                              "cognito-sync:*",
                              "execute-api:*"
                          ],
                          resources: ["*"]
                      }
                  ),
                  new iam.PolicyStatement({
                      actions: ["iot:*", "greengrass:*"],
                      resources: ["*"]
                  })
              ]
          }
          )
      )

      // These should be preserved somewhere permanent so they could be
      // auto-inserted into the dashboard. As it stands, these values
      // have to be manually transferred over to the dashboard, where
      // it has to be rebuilt and pushed out to S3.
      //
      new cognito.CfnIdentityPoolRoleAttachment(this,
          "cognito_identity_pool_role_attachment", {
              identityPoolId: this.identityPool.ref,
              roles: {
                  "authenticated": this.authRole.roleArn,
                  "unauthenticated": this.unauthRole.roleArn
              }
          })
  }
}
