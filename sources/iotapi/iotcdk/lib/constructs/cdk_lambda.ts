/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import api = require('aws-cdk-lib/aws-apigateway')
import lambda = require('aws-cdk-lib/aws-lambda')
import iam = require('aws-cdk-lib/aws-iam')
import ec2 = require('aws-cdk-lib/aws-ec2')
import iot = require('aws-cdk-lib/aws-iot')
import waf = require('aws-cdk-lib/aws-wafv2');
import {Code} from "aws-cdk-lib/aws-lambda"
const path = require( "path" )
import { Common } from './common'
import {ManagedPolicy} from "@aws-cdk/aws-iam";
import { LambdaRestApi, CfnAuthorizer, LambdaIntegration, AuthorizationType } from 'aws-cdk-lib/aws-apigateway';
import {CDKStaticIOT} from "./cdk_staticiot";
import {CDKLambdaLayer} from "./cdk_lambdalayer";
import {CDKTimestream} from "./cdk_timestream";
import {CfnTopicRule} from "aws-cdk-lib/aws-iot";
import LambdaActionProperty = CfnTopicRule.LambdaActionProperty;
import {CDKDynamoDB} from "./cdk_dynamodb";


interface ILambdaProps extends cdk.NestedStackProps {
    prefix: string,
    stage: string,
    uuid: string,
    logLevel: string,
    dbPasswordKey: string,
    dynamoDB: CDKDynamoDB,
    httpsPort: number,
    layer: CDKLambdaLayer,
    lambdaTimeOutSecs: number,
    region: string,
    gatewayRepublishTopics: string,
    securityGroup: ec2.ISecurityGroup,
    dbSecurityGroup: ec2.ISecurityGroup,
    cognitoUserpoolArn: string,
    staticIot: CDKStaticIOT,
    timestream?: CDKTimestream,
    vpc: ec2.IVpc,
    useSSO: boolean,
    samlMetadataFilePath: string,
    tags: {[name: string]: any}
};


export class CDKLambda extends cdk.NestedStack {

    private localGwGGRole: iam.Role;
    public apiLambda: lambda.Function;
    public apiGw: api.RestApi;
    private lambdaAuthorizer: CfnAuthorizer;
    public ggGwLambda: lambda.Function
    public ssoAPIGatewayInvokeRole: iam.Role;

    // These are lambdas created to handle all the API calls. We save them so
    // things like IOT rules can reference them.
    //
    public projectLambda: lambda.Function;
    public modelLambda: lambda.Function;
    public deviceLambda: lambda.Function;
    public dataTypeLambda: lambda.Function;
    public dataLambda: lambda.Function;
    public userLambda: lambda.Function;
    public locationLambda: lambda.Function;

    public adminLambda: lambda.Function;
    public featureManagerLambda: lambda.Function;
    public firmwareLambda: lambda.Function;
    public settingLambda: lambda.Function;
    public templateLambda: lambda.Function;
    public updateLambda: lambda.Function;

    public uiAdminLambda: lambda.Function;
    public uiAuthLambda: lambda.Function;
    public uiDataLambda: lambda.Function;
    public uiDataTypeLambda: lambda.Function;
    public uiDeviceLambda: lambda.Function;
    public uiModelLambda: lambda.Function;
    public uiProjectLambda: lambda.Function;
    public uiStartLambda: lambda.Function;
    public uiUserLambda: lambda.Function;

    public featureAlexaLambda: lambda.Function;
    public featureConnectLambda: lambda.Function;
    public featureGrafanaLambda: lambda.Function;
    public featureLocationLambda: lambda.Function;
    public featureTwinLambda: lambda.Function;
    public featureSmsLambda: lambda.Function;

    constructor(scope: Construct,
                id: string, props: ILambdaProps)
        {
        super(scope, id);
        Common.addTags(this, props.tags)

        // let localGwGGRoleName = namePrefix + "_gw_gg_local_role";
        // this.localGwGGRole = new iam.Role(this, namePrefix + "_gw_gg_local_role",
        // {
        //     assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        //     roleName: localGwGGRoleName,
        //     inlinePolicies: {
        //         "GG": new iam.PolicyDocument({
        //             statements: [
        //                 new iam.PolicyStatement({
        //                     actions: [
        //                         "sts:AssumeRole"
        //                     ],
        //                     resources: ["*"]
        //                 }),
        //                 new iam.PolicyStatement({
        //                     actions: [
        //                         "logs:CreateLogGroup",
        //                         "logs:CreateLogStream",
        //                         "logs:PutLogEvents"
        //                     ],
        //                     resources: ["arn:aws:logs:*:*:*"]
        //                 })
        //             ]
        //         })
        //     }
        // });

        // There are three kinds of lambdas. The ones called by the dashboard, the ones invoked by the
        // IOT once data comes in from each device (this includes the one invoked by the SQS processor),
        // and the ones called by Greengrass and pushed onto a device.
        // Some of these need access to the database. All database methods are stored in two layers that
        // contains the code for accessing the database. One layer contains python DB drivers and the other
        // the common code that all lambdas use to access the database.
        // Those layers are stored under lambda_src/layers/... and are zip archived in the format expected
        // by lambda layers.
        //

        // Now let's create the API gateway for the calls that need access from dashboard and mobile
        // access.
        //
        let restApiName = props.prefix + "_rest_api";

        // NOTE: we create different APIs for each stage to maintain isolation.
        // For user-friendliness, we also deploy each stage with the stage name.
        // For example, for the 'dev' stage, the name of the api will be "###_dev_rest_api"
        // and it will be deployed with the 'dev' stage, so the endpoint API for it will
        // end up being 'https://....../dev'.
        // This makes it easier to tell them apart during testing. However, it means
        // if using tools like Postman, you'll want to not only point it at the right
        // API URL, but also get the stage name in there correctly.
        //
        this.apiGw = new api.RestApi(this, id + "_rest_api", {
            restApiName: restApiName,
            description: "API for " + props.stage + " stage",
            endpointTypes: [ api.EndpointType.REGIONAL ],
            deploy: true,
            deployOptions: {
                stageName: props.stage,
                loggingLevel: api.MethodLoggingLevel.INFO,
                dataTraceEnabled: false // NOTE: setting this to true on internal sandbox systems will flag a SEVERE error.
            },
            defaultCorsPreflightOptions: {
                allowOrigins: api.Cors.ALL_ORIGINS
                // allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
            }
            // Uncomment the following if you want to assign a custom domain
            // to the API
            //
            // , domainName: {
            //     domainName: "api.mydomain.com",
            //     certificate: acmCertificateForAPIDomain
            // }
            //
         });

        // Let's add the WAF to the API gateway for better security
        //
        this.addWAFToAPIGateway(props);

        // If using SSO, we don't need lambda authorizers and cognito user pools.
        // Instead, we'll be using IAM. If using SSO, however, we need to create
        // an SSO role that allows access to the API gateway. For development we're
        // keeping it open. But for production it should be limited so only access from
        // the dashboard is allowed.
        //
        // For this to work, we need the path to the saml-metadata-document.xml file.
        // The installer asks for this and stores it in the bootstrap file.
        //
        // More info here: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-iam-readme.html
        //
        if (props.useSSO) {
            let ssoRoleName = "simpleiot_sso_api_invoke_role"

            // This is commented for now until it can be further tested with different SAML IDP providers.
            // For now, to make this work, set up your AWS SSO and in IAM create a Role with SAML 2.0. Choose
            // "Both Console and Programmatic Access" then add an AmazonAPIGatewayInvokeFullAccess policy to it.
            //
            // const provider = new iam.SamlProvider(this, 'SSO_SAML_Provider', {
            //     metadataDocument: iam.SamlMetadataDocument.fromFile(props.samlMetadataFilePath),
            // });
            // this.ssoAPIGatewayInvokeRole = new iam.Role(this, id + "sso_saml_role", {
            //     assumedBy: new iam.SamlConsolePrincipal(provider),
            //     roleName: ssoRoleName,
            //     managedPolicies: [
            //             ManagedPolicy.fromAwsManagedPolicyName("AmazonAPIGatewayInvokeFullAccess")
            //         ]
            //     }
            // );

        } else {
            // API Authorizer that uses Cognito User pool to Authorize users.
            let authorizerName = props.prefix + "_cognito_authorizer"
            this.lambdaAuthorizer = new CfnAuthorizer(this, id + "_cognito_authorizer", {
                restApiId: this.apiGw.restApiId,
                name: authorizerName,
                type: 'COGNITO_USER_POOLS',
                identitySource: 'method.request.header.Authorization',
                providerArns: [props.cognitoUserpoolArn],
            })
        }

        // This authorizer is an example for creating one and validating it using a lambda.
        // We're not using it here, but it's here if someone wants to use their own
        // user authorization system instead of Cognito.
        //
        // let apiAuthorizerName = namePrefix + "_auth_authorizer";
        // this.apiAuthorizer = new api.RequestAuthorizer(this, apiAuthorizerName, {
        //     handler: this.apiAuthorizerLambda,
        //     identitySources: [api.IdentitySource.header('Authorization')]
        // })

        // These are properties for passing down to each function.
        //

       // this.roleLambda = this.defineLambdaAndAPI(this.apiGw,
       //     "role",
       //     "api_role",
       //      "./lib/lambda_src/api/iot_api_role",
       //     lambdaParams, false, true, true, true, true);

       // We create a map with the name of API prefixes and the actual resources in them.
       // Later on, we lookup each parent resource in this table so we know where to
       // attach each REST API path to. For example, if definiting "/ui/user", we
       // would add "user" to the "ui" resource which is already defined under the root.

       let apiRoot = this.apiGw.root.addResource('v1');
       let uiResource = apiRoot.addResource("ui")
       let featureResource = apiRoot.addResource("feature")

       this.projectLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "project",
           "api_project",
            "./lib/lambda_src/api/iot_api_project",
           props, false, true, true, true, true);

       this.modelLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "model",
           "api_model",
            "./lib/lambda_src/api/iot_api_model",
           props, false, true, true, true, true);

       this.dataTypeLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "datatype",
           "api_datatype",
            "./lib/lambda_src/api/iot_api_datatype",
           props, false, true, true, true, true);

       this.dataLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "data",
           "api_data",
            "./lib/lambda_src/api/iot_api_data",
           props, false, true, true, true, true);

        // Allow the data set API to read/write to the dynamodb table
        //
        props.dynamoDB.dynamoDBTable.grantReadWriteData(this.dataLambda);

       this.deviceLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "device",
           "api_device",
            "./lib/lambda_src/api/iot_api_device",
           props,false, true, true, true, true);

       this.adminLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "admin",
           "api_admin",
            "./lib/lambda_src/api/iot_api_admin",
           props,false, true, true, true, true);

       this.featureManagerLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "featuremanager",
           "api_featuremanager",
            "./lib/lambda_src/api/iot_api_featuremanager",
           props,false, true, true, true, true);

       this.firmwareLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "firmware",
           "api_firmware",
            "./lib/lambda_src/api/iot_api_firmware",
           props,false, true, true, true, true);

       this.settingLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "setting",
           "api_setting",
            "./lib/lambda_src/api/iot_api_setting",
           props,false, true, true, true, true);

         // If we're not using SSO, then we want to define user-management APIs
         // that act as front for Cognito user pools. Eventually, we'll need role support
         // as well.
         //
        if (!props.useSSO) {
            this.userLambda = this.defineLambdaAndAPI(this.apiGw,
                apiRoot,
                "user",
                "api_user",
                "./lib/lambda_src/api/iot_api_user",
                props, false, true, true, true, true);
        }

       this.locationLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "location",
           "api_location",
            "./lib/lambda_src/api/iot_api_location",
           props,false, true, true, true, true);

       this.templateLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "template",
           "api_template",
            "./lib/lambda_src/api/iot_api_template",
           props,false, true, true, true, true);

       this.updateLambda = this.defineLambdaAndAPI(this.apiGw,
           apiRoot,
           "update",
           "api_update",
            "./lib/lambda_src/api/iot_api_update",
           props,false, true, true, true, true);

       this.uiAdminLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "admin",
           "ui_api_admin",
            "./lib/lambda_src/api/ui/iot_ui_api_admin",
           props,false, true, true, true, true);

       this.uiAuthLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "auth",
           "ui_api_auth",
            "./lib/lambda_src/api/ui/iot_ui_api_auth",
           props,false, true, true, true, true);

       this.uiDataLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "data",
           "ui_api_data",
            "./lib/lambda_src/api/ui/iot_ui_api_data",
           props,false, true, true, true, true);

       this.uiDataTypeLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "datatype",
           "ui_api_datatype",
            "./lib/lambda_src/api/ui/iot_ui_api_datatype",
           props,false, true, true, true, true);

       this.uiDeviceLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "device",
           "ui_api_device",
            "./lib/lambda_src/api/ui/iot_ui_api_device",
           props,false, true, true, true, true);

       this.uiModelLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "model",
           "ui_api_model",
            "./lib/lambda_src/api/ui/iot_ui_api_model",
           props,false, true, true, true, true);

       this.uiProjectLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "project",
           "ui_api_project",
            "./lib/lambda_src/api/ui/iot_ui_api_project",
           props,false, true, true, true, true);

       this.uiStartLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "start",
           "ui_api_start",
            "./lib/lambda_src/api/ui/iot_ui_api_start",
           props,false, true, true, true, true);

       this.uiUserLambda = this.defineLambdaAndAPI(this.apiGw,
           uiResource,
           "user",
           "ui_api_user",
            "./lib/lambda_src/api/ui/iot_ui_api_user",
           props,false, true, true, true, true);

       // These are all optional. We're defining it here, but it really should be moved
       // to a more dynamic feature manager so we can activate/add/remove them like plugins.
       //
       this.featureAlexaLambda = this.defineLambdaAndAPI(this.apiGw,
           featureResource,
           "alexa",
           "feature_api_alexa",
            "./lib/lambda_src/api/feature/iot_feature_api_alexa",
           props,false, true, true, true, true);

       this.featureConnectLambda = this.defineLambdaAndAPI(this.apiGw,
           featureResource,
           "connect",
           "feature_api_connect",
            "./lib/lambda_src/api/feature/iot_feature_api_connect",
           props,false, true, true, true, true);

       this.featureGrafanaLambda = this.defineLambdaAndAPI(this.apiGw,
           featureResource,
           "grafana",
           "feature_api_grafana",
            "./lib/lambda_src/api/feature/iot_feature_api_connect",
           props,false, true, true, true, true);

       this.featureLocationLambda = this.defineLambdaAndAPI(this.apiGw,
           featureResource,
           "location",
           "feature_api_location",
            "./lib/lambda_src/api/feature/iot_feature_api_location",
           props,false, true, true, true, true);

       this.featureTwinLambda = this.defineLambdaAndAPI(this.apiGw,
           featureResource,
           "twin",
           "feature_api_twin",
            "./lib/lambda_src/api/feature/iot_feature_api_twin",
           props,false, true, true, true, true);

       this.featureSmsLambda = this.defineLambdaAndAPI(this.apiGw,
           featureResource,
           "sms",
           "feature_api_sms",
            "./lib/lambda_src/api/feature/iot_feature_api_sms",
           props,false, true, true, true, true);
       //
       // This lambda is going to be used for on-device GG deployment. There's no external API for this.
       // We do need to save the ARN, though, in case it has be passed on to the CLI handler.
       //
       // this.ggGwLambda = this.defineLocalGGLambda(namePrefix,
       //     "gw_gg_lambda",
       //     gatewayRepublishTopics,
       //     "./lib/lambda_src/api/iot_gateway_lambda")
       //
       // Common.output(this, "ggGwLambdaARN", this.ggGwLambda.functionArn,
       //  "Gateway GG lambda ARN")

       // Define IOT rules that se
            // nd traffic to lambdas (and give them persmission)
       //
       this.defineIOTRules(props);
    }

    // NOTE: at this point in time, on-device lambdas can be up to Python 3.7.
    // Elsewhere, they can go higher. So we have to hardcode it here.
    //
    // defineLocalGGLambda(prefix: string, lambdaName: string,
    //                    gatewayRepublishTopics: string,
    //                    pathToLambda: string) {
    //     let functionName = prefix + "_" + lambdaName
    //     let lambdaFunction = new lambda.Function(this, prefix + lambdaName, {
    //         runtime: lambda.Runtime.PYTHON_3_7,
    //         handler: "main.lambda_handler",
    //         functionName: functionName,
    //         role: this.localGwGGRole,
    //         timeout: core.Duration.seconds(LAMBDA_TIMEOUT_SECS),
    //         code: new lambda.AssetCode(pathToLambda),
    //         environment: {
    //             "MQTT_SUB": gatewayRepublishTopics
    //         }
    //     });
    //     return lambdaFunction
    // }

    /*
     * Security audit requires a separate role per lambda.
     */
    createIAMRole(lambdaName: string, props: ILambdaProps) : iam.Role {

        let lambdaExecRoleName = "lambda_iam_role_" + lambdaName;

        // NOTE: there's a max of 10 managed policies. If more than that, deployment will fail.
        // Also, before final release, we need to make these narrower.

        let lambdaExecutionRole = new iam.Role(this,  lambdaExecRoleName,
            {
                assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
                roleName: lambdaExecRoleName,
                managedPolicies: [
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonRDSFullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
                    ManagedPolicy.fromAwsManagedPolicyName("AWSGreengrassFullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("AWSIoTFullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonTimestreamFullAccess"),
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
                ],
                inlinePolicies: {
                    'assume_role': new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                actions: [
                                    "sts:AssumeRole"
                                ],
                                resources: ["*"]
                            })
                        ]
                    }),
                    'invoke_lambda': new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                actions: [
                                    "lambda:invokeFunction",
                                    "lambda:invokeAsync"
                                ],
                                resources: ["*"]
                            })
                        ]
                    }),
                    'invalidate_cloudfront': new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                actions: [
                                    "cloudfront:CreateInvalidation"
                                ],
                                resources: ["*"]
                            })
                        ]
                    }),
                    /* This is so we can write location data to AWS Location trackers */
                    'geo_location_role': new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                actions: [
                                    "geo:SearchPlaceIndexForText",
                                    "geo:CreatePlaceIndex",
                                    "geo:DeletePlaceIndex",
                                    "geo:BatchDeleteDevicePositionHistory",
                                    "geo:DeleteTracker",
                                    "geo:AssociateTrackerConsumer",
                                    "geo:UpdateTracker",
                                    "geo:CreateTracker",
                                    "geo:ListPlaceIndexes",
                                    "geo:CreateRouteCalculator",
                                    "geo:BatchUpdateDevicePosition"
                                ],
                                resources: ["*"]
                            })
                        ]
                    }),
                    /* This is so we can send provisioning messages via SMS. */
                    'send_sms': new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                actions: [
                                    "mobiletargeting:SendMessages",
                                    "mobiletargeting:SendUsersMessages"
                                ],
                                resources: ["*"]
                            })
                        ]
                    }),
                }
            }
        )
        return lambdaExecutionRole;
    }

      // Set up IOT actions that invoke a lambda. We used to have this in a separate
      // stack but were getting nasty circular references, so now it's defined here.
      //
      // This IOT rule sends any changes in data from the device side to the monitor
      // and lambda. DataTypes marked as 'show_on_twin' will be re-broadcast to a monitor
      // topic so they can be shown on the console.
      //
    defineIOTRules(props: ILambdaProps) {
       const lambdaIotAction: LambdaActionProperty = {
            functionArn: this.dataLambda.functionArn,
       };

       const iotDataRule = new iot.CfnTopicRule(this, 'iot_lambda_fwd_rule', {
            topicRulePayload: {
                actions: [
                    {
                        lambda: lambdaIotAction,
                    },
                ],
                ruleDisabled: false,
                sql: `SELECT * FROM 'simpleiot_v1/app/data/#'`,
                awsIotSqlVersion: '2016-03-23',
            },
       });

        // We need to give IOT permission to send the data to lambda otherwise it fails.
        //
       this.dataLambda.addPermission('iot_allow_lambda_invoke_rule', {
            principal: new iam.ServicePrincipal('iot.amazonaws.com'),
            sourceArn: iotDataRule.attrArn,
       });

       // We set up a separate rule, where .../checkupdate/... MQTT messages are sent over to
       // the lambda that handles updates.
       //
       const lambdaUpdateAction: LambdaActionProperty = {
            functionArn: this.updateLambda.functionArn,
       };
       const iotUpdateRule = new iot.CfnTopicRule(this, 'iot_lambda_update_rule', {
            topicRulePayload: {
                actions: [
                    {
                        lambda: lambdaUpdateAction,
                    },
                ],
                ruleDisabled: false,
                sql: `SELECT * FROM 'simpleiot_v1/checkupdate/#'`,
                awsIotSqlVersion: '2016-03-23',
            },
       });

        // We need to give IOT permission to send the data to lambda otherwise it fails.
        //
       this.updateLambda.addPermission('iot_allow_invoke_lambda_permission', {
            principal: new iam.ServicePrincipal('iot.amazonaws.com'),
            sourceArn: iotUpdateRule.attrArn,
       });
    }

    addWAFToAPIGateway(props: ILambdaProps) {

        // For security reasons, we also add a Web Application Firewall in front of the API
        // Gateway. This used to be in a separate stack but had to be moved here to avoid
        // circular references.

        // Routine to set up WAF rules. Directly based on:
        // https://github.com/cdk-patterns/serverless/blob/main/the-waf-apigateway/typescript/lib/the-waf-stack.ts

        let wafRules:Array<waf.CfnWebACL.RuleProperty>  = [];

        // AWS Managed Rules
        // These are basic rules. Note that it excludes size restrictions on the body
        // so file upload/downloads. If there are issues with this, you may want to
        // adjust this rule.
        //
        let awsManagedRules:waf.CfnWebACL.RuleProperty  = {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: {none: {}},
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesCommonRuleSet',
              vendorName: 'AWS',
              excludedRules: [{name: 'SizeRestrictions_BODY'}]
            }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'awsCommonRules',
            sampledRequestsEnabled: true
          }
        };

        wafRules.push(awsManagedRules);

        // AWS ip reputation List
        //
        let awsIPRepList:waf.CfnWebACL.RuleProperty  = {
          name: 'awsIPReputation',
          priority: 2,
          overrideAction: {none: {}},
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesAmazonIpReputationList',
              vendorName: 'AWS',
              excludedRules: []
            }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'awsReputation',
            sampledRequestsEnabled: true
          }
        };

        wafRules.push(awsIPRepList);

        // Create Web ACL
        let webACL = new waf.CfnWebACL(this, 'WebACL', {
          defaultAction: {
            allow: {}
          },
          scope: 'REGIONAL',
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'webACL',
            sampledRequestsEnabled: true
          },
          rules: wafRules
        });

        let apiGatewayARN = `arn:aws:apigateway:${props.region}::/restapis/${this.apiGw.restApiId}/stages/${this.apiGw.deploymentStage.stageName}`

        // For example: arn:aws:apigateway:us-west-2::/restapis/lvr22sqzva/stages/dev

        // Associate WAF with gateway
        //
        new waf.CfnWebACLAssociation(this, 'WebACLAssociation', {
          webAclArn: webACL.attrArn,
          resourceArn: apiGatewayARN
        })
    }

    // This is used to define each lambda and the associated API gateway REST verb
    // NOTE that if the lambda wants to use relative imports, it will have to have its
    // code inside a Python module and the handler will have to be modified (see above
    // for example).
    //
    defineLambdaAndAPI(restApi: api.RestApi,
                       parentResource: api.Resource,
                       restResourceName: string,
                       lambdaName: string,
                       pathToLambda: string,
                       props: ILambdaProps,
                       doAny: boolean,
                       doPost: boolean,
                       doGet: boolean,
                       doPut: boolean,
                       doDelete: boolean,
                       handler: string="main.lambda_handler") {

        let prefix = props.prefix;
        let functionName = prefix + "_" + lambdaName

        // We only define the key to get db credentials out of the secretsmanager.
        // The key returns all database connection data needed at runtime.
        //
        let lambda_env : {[key: string]: any}= {
                "DB_PASS_KEY": props.dbPasswordKey,
                "DYNAMODB_TABLE": props.dynamoDB.dynamoDBTable.tableName,
                "PREFIX": prefix,
                "IOT_ENDPOINT": props.staticIot.iotMonitorEndpoint,
                "STAGE": props.stage,
                "IOT_LOGLEVEL": props.logLevel
            };

        if (props.timestream) {
            lambda_env["TS_DATABASE"] = props.timestream.databaseName;
            lambda_env["TS_TABLENAME"] = props.timestream.tableName;
        }

        let lambdaRole = this.createIAMRole(functionName, props);

        let lambdaFunction = new lambda.Function(this, "lambda_" + lambdaName, {
            runtime: Common.pythonRuntimeVersion(),
            handler: handler,
            layers: props.layer.allLayers,
            functionName: functionName,
            role: lambdaRole,
            vpc: props.vpc,
            timeout: cdk.Duration.seconds(props.lambdaTimeOutSecs),
            securityGroups: [props.securityGroup, props.dbSecurityGroup],
            code: new lambda.AssetCode(pathToLambda),
            environment: lambda_env
        });

        let thisResource = parentResource.addResource(restResourceName);
        // console.log("Adding resource " + restResourceName + " to parent: " + parentResource.toString())
        let lambdaIntegration = new api.LambdaIntegration(lambdaFunction);

        // NOTE: all these go to the same function. The function checks the incoming
        // http verb to route what it should do. We could just as easily have set up
        // a separate lambda for each one.
        //
        if (doAny) {
            thisResource.addProxy({
                defaultIntegration: lambdaIntegration,
                anyMethod: true
            })
        } else {
            if (doPost) {
                this.addMethod(thisResource, 'POST', lambdaIntegration, props.useSSO);
            }
            if (doPut) {
                this.addMethod(thisResource, 'PUT', lambdaIntegration, props.useSSO);
            }
            if (doGet) {
                this.addMethod(thisResource, 'GET', lambdaIntegration, props.useSSO);
            }
            if (doDelete) {
                this.addMethod(thisResource, 'DELETE', lambdaIntegration, props.useSSO);
            }
        }

        // We can output the lambda names and ARN for later phases in deployment
        // they are saved in the output JSON file. However, the names have to be converted
        // from snake_case to camelCase to let CfnOutput work.
        // Ordinarily you don't need to output these since the API Gateway calls them.
        //
        // But if a lambda needs to be directly invoked from a script file via ARN, then
        // it needs to be passed on here.
        //
        // let cleanName = Common.snakeToCamel(functionName)
        // Common.output(this, cleanName,
        //     cleanName,
        //     "Lambda Created Name")
        // Common.output(this, "lambda" + cleanName + "Arn",
        //     result.functionArn,
        //     "Lambda ARN")

        return lambdaFunction;
    }

    // Utility routine to add a lambda integration to a REST API for a given HTTP verb
    // We're doing this one verb at a time instead of for every possible HTTP to allow
    // other verbs to be used for other purposes in the future.
    //
    // If we're using SSO, the authorizer will be set to IAM. If not, we're going to use
    // Cognito authorization.
    //
    addMethod(resource: api.Resource, httpVerb: string, integration: api.LambdaIntegration,
              useSSO: boolean) {
        if (useSSO) {
            resource.addMethod(httpVerb, integration,
                {
                    authorizationType: AuthorizationType.IAM
                });
        } else {
            // console.log("Adding Method: " + httpVerb + " to resource: " + resource.toString());
            resource.addMethod(httpVerb, integration,
                {
                    authorizationType: AuthorizationType.COGNITO,
                    authorizer: {
                        authorizerId: this.lambdaAuthorizer.ref
                    }
                });
        }
    }
    // For custom authorizer above, use this instead.
    //
    //authorizer: this.apiAuthorizer
    // authorizationType: api.AuthorizationType.CUSTOM,
    // authorizer: {
    //     authorizerId: this.apiAuthorizer.authorizerId
    // }

    // This method is used to go back to the lambdas that we need and add the IOT endpoint
    // to them as an environment variable.
    //
    public setIotEndpoint(iotEndpoint: string) {

    }
}


//
// In case we need to add CORS support to the API
//
 export function addCorsOptions(apiResource: api.IResource) {
     apiResource.addMethod('OPTIONS', new api.MockIntegration({
         integrationResponses: [{
             statusCode: '200',
             responseParameters: {
                 'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
                 'method.response.header.Access-Control-Allow-Origin': "'*'",
                 'method.response.header.Access-Control-Allow-Credentials': "'false'",
                 'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
             },
         }],
         passthroughBehavior: api.PassthroughBehavior.NEVER,
         requestTemplates: {
             "application/json": "{\"statusCode\": 200}"
         },
     }), {
         methodResponses: [{
             statusCode: '200',
             responseParameters: {
                 'method.response.header.Access-Control-Allow-Headers': true,
                 'method.response.header.Access-Control-Allow-Methods': true,
                 'method.response.header.Access-Control-Allow-Credentials': true,
                 'method.response.header.Access-Control-Allow-Origin': true,
             },
         }]
     })
 }


