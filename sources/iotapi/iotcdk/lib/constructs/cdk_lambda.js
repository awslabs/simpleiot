"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCorsOptions = exports.CDKLambda = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
const cdk = require("aws-cdk-lib");
const api = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iot = require("aws-cdk-lib/aws-iot");
const waf = require("aws-cdk-lib/aws-wafv2");
const path = require("path");
const common_1 = require("./common");
const aws_iam_1 = require("@aws-cdk/aws-iam");
const aws_apigateway_1 = require("aws-cdk-lib/aws-apigateway");
;
class CDKLambda extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
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
            endpointTypes: [api.EndpointType.REGIONAL],
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
            let ssoRoleName = "simpleiot_sso_api_invoke_role";
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
        }
        else {
            // API Authorizer that uses Cognito User pool to Authorize users.
            let authorizerName = props.prefix + "_cognito_authorizer";
            this.lambdaAuthorizer = new aws_apigateway_1.CfnAuthorizer(this, id + "_cognito_authorizer", {
                restApiId: this.apiGw.restApiId,
                name: authorizerName,
                type: 'COGNITO_USER_POOLS',
                identitySource: 'method.request.header.Authorization',
                providerArns: [props.cognitoUserpoolArn],
            });
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
        let uiResource = apiRoot.addResource("ui");
        let featureResource = apiRoot.addResource("feature");
        this.projectLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "project", "api_project", "./lib/lambda_src/api/iot_api_project", props, false, true, true, true, true);
        this.modelLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "model", "api_model", "./lib/lambda_src/api/iot_api_model", props, false, true, true, true, true);
        this.dataTypeLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "datatype", "api_datatype", "./lib/lambda_src/api/iot_api_datatype", props, false, true, true, true, true);
        this.dataLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "data", "api_data", "./lib/lambda_src/api/iot_api_data", props, false, true, true, true, true);
        // Allow the data set API to read/write to the dynamodb table
        //
        props.dynamoDB.dynamoDBTable.grantReadWriteData(this.dataLambda);
        this.deviceLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "device", "api_device", "./lib/lambda_src/api/iot_api_device", props, false, true, true, true, true);
        this.adminLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "admin", "api_admin", "./lib/lambda_src/api/iot_api_admin", props, false, true, true, true, true);
        this.featureManagerLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "featuremanager", "api_featuremanager", "./lib/lambda_src/api/iot_api_featuremanager", props, false, true, true, true, true);
        this.firmwareLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "firmware", "api_firmware", "./lib/lambda_src/api/iot_api_firmware", props, false, true, true, true, true);
        this.settingLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "setting", "api_setting", "./lib/lambda_src/api/iot_api_setting", props, false, true, true, true, true);
        // If we're not using SSO, then we want to define user-management APIs
        // that act as front for Cognito user pools. Eventually, we'll need role support
        // as well.
        //
        if (!props.useSSO) {
            this.userLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "user", "api_user", "./lib/lambda_src/api/iot_api_user", props, false, true, true, true, true);
        }
        this.locationLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "location", "api_location", "./lib/lambda_src/api/iot_api_location", props, false, true, true, true, true);
        this.templateLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "template", "api_template", "./lib/lambda_src/api/iot_api_template", props, false, true, true, true, true);
        this.updateLambda = this.defineLambdaAndAPI(this.apiGw, apiRoot, "update", "api_update", "./lib/lambda_src/api/iot_api_update", props, false, true, true, true, true);
        this.uiAdminLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "admin", "ui_api_admin", "./lib/lambda_src/api/ui/iot_ui_api_admin", props, false, true, true, true, true);
        this.uiAuthLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "auth", "ui_api_auth", "./lib/lambda_src/api/ui/iot_ui_api_auth", props, false, true, true, true, true);
        this.uiDataLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "data", "ui_api_data", "./lib/lambda_src/api/ui/iot_ui_api_data", props, false, true, true, true, true);
        this.uiDataTypeLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "datatype", "ui_api_datatype", "./lib/lambda_src/api/ui/iot_ui_api_datatype", props, false, true, true, true, true);
        this.uiDeviceLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "device", "ui_api_device", "./lib/lambda_src/api/ui/iot_ui_api_device", props, false, true, true, true, true);
        this.uiModelLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "model", "ui_api_model", "./lib/lambda_src/api/ui/iot_ui_api_model", props, false, true, true, true, true);
        this.uiProjectLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "project", "ui_api_project", "./lib/lambda_src/api/ui/iot_ui_api_project", props, false, true, true, true, true);
        this.uiStartLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "start", "ui_api_start", "./lib/lambda_src/api/ui/iot_ui_api_start", props, false, true, true, true, true);
        this.uiUserLambda = this.defineLambdaAndAPI(this.apiGw, uiResource, "user", "ui_api_user", "./lib/lambda_src/api/ui/iot_ui_api_user", props, false, true, true, true, true);
        // These are all optional. We're defining it here, but it really should be moved
        // to a more dynamic feature manager so we can activate/add/remove them like plugins.
        //
        this.featureAlexaLambda = this.defineLambdaAndAPI(this.apiGw, featureResource, "alexa", "feature_api_alexa", "./lib/lambda_src/api/feature/iot_feature_api_alexa", props, false, true, true, true, true);
        this.featureConnectLambda = this.defineLambdaAndAPI(this.apiGw, featureResource, "connect", "feature_api_connect", "./lib/lambda_src/api/feature/iot_feature_api_connect", props, false, true, true, true, true);
        this.featureGrafanaLambda = this.defineLambdaAndAPI(this.apiGw, featureResource, "grafana", "feature_api_grafana", "./lib/lambda_src/api/feature/iot_feature_api_connect", props, false, true, true, true, true);
        this.featureLocationLambda = this.defineLambdaAndAPI(this.apiGw, featureResource, "location", "feature_api_location", "./lib/lambda_src/api/feature/iot_feature_api_location", props, false, true, true, true, true);
        this.featureTwinLambda = this.defineLambdaAndAPI(this.apiGw, featureResource, "twin", "feature_api_twin", "./lib/lambda_src/api/feature/iot_feature_api_twin", props, false, true, true, true, true);
        this.featureSmsLambda = this.defineLambdaAndAPI(this.apiGw, featureResource, "sms", "feature_api_sms", "./lib/lambda_src/api/feature/iot_feature_api_sms", props, false, true, true, true, true);
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
    createIAMRole(lambdaName, props) {
        let lambdaExecRoleName = "lambda_iam_role_" + lambdaName;
        // NOTE: there's a max of 10 managed policies. If more than that, deployment will fail.
        // Also, before final release, we need to make these narrower.
        let lambdaExecutionRole = new iam.Role(this, lambdaExecRoleName, {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            roleName: lambdaExecRoleName,
            managedPolicies: [
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AmazonRDSFullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AWSGreengrassFullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AWSIoTFullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AmazonTimestreamFullAccess"),
                aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
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
        });
        return lambdaExecutionRole;
    }
    // Set up IOT actions that invoke a lambda. We used to have this in a separate
    // stack but were getting nasty circular references, so now it's defined here.
    //
    // This IOT rule sends any changes in data from the device side to the monitor
    // and lambda. DataTypes marked as 'show_on_twin' will be re-broadcast to a monitor
    // topic so they can be shown on the console.
    //
    defineIOTRules(props) {
        const lambdaIotAction = {
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
        const lambdaUpdateAction = {
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
    addWAFToAPIGateway(props) {
        // For security reasons, we also add a Web Application Firewall in front of the API
        // Gateway. This used to be in a separate stack but had to be moved here to avoid
        // circular references.
        // Routine to set up WAF rules. Directly based on:
        // https://github.com/cdk-patterns/serverless/blob/main/the-waf-apigateway/typescript/lib/the-waf-stack.ts
        let wafRules = [];
        // AWS Managed Rules
        // These are basic rules. Note that it excludes size restrictions on the body
        // so file upload/downloads. If there are issues with this, you may want to
        // adjust this rule.
        //
        let awsManagedRules = {
            name: 'AWS-AWSManagedRulesCommonRuleSet',
            priority: 1,
            overrideAction: { none: {} },
            statement: {
                managedRuleGroupStatement: {
                    name: 'AWSManagedRulesCommonRuleSet',
                    vendorName: 'AWS',
                    excludedRules: [{ name: 'SizeRestrictions_BODY' }]
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
        let awsIPRepList = {
            name: 'awsIPReputation',
            priority: 2,
            overrideAction: { none: {} },
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
        let apiGatewayARN = `arn:aws:apigateway:${props.region}::/restapis/${this.apiGw.restApiId}/stages/${this.apiGw.deploymentStage.stageName}`;
        // For example: arn:aws:apigateway:us-west-2::/restapis/lvr22sqzva/stages/dev
        // Associate WAF with gateway
        //
        new waf.CfnWebACLAssociation(this, 'WebACLAssociation', {
            webAclArn: webACL.attrArn,
            resourceArn: apiGatewayARN
        });
    }
    // This is used to define each lambda and the associated API gateway REST verb
    // NOTE that if the lambda wants to use relative imports, it will have to have its
    // code inside a Python module and the handler will have to be modified (see above
    // for example).
    //
    defineLambdaAndAPI(restApi, parentResource, restResourceName, lambdaName, pathToLambda, props, doAny, doPost, doGet, doPut, doDelete, handler = "main.lambda_handler") {
        let prefix = props.prefix;
        let functionName = prefix + "_" + lambdaName;
        // We only define the key to get db credentials out of the secretsmanager.
        // The key returns all database connection data needed at runtime.
        //
        let lambda_env = {
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
            runtime: common_1.Common.pythonRuntimeVersion(),
            handler: handler,
            layers: props.layer.allLayers,
            functionName: functionName,
            role: lambdaRole,
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
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
            });
        }
        else {
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
    addMethod(resource, httpVerb, integration, useSSO) {
        if (useSSO) {
            resource.addMethod(httpVerb, integration, {
                authorizationType: aws_apigateway_1.AuthorizationType.IAM
            });
        }
        else {
            // console.log("Adding Method: " + httpVerb + " to resource: " + resource.toString());
            resource.addMethod(httpVerb, integration, {
                authorizationType: aws_apigateway_1.AuthorizationType.COGNITO,
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
    setIotEndpoint(iotEndpoint) {
    }
}
exports.CDKLambda = CDKLambda;
//
// In case we need to add CORS support to the API
//
function addCorsOptions(apiResource) {
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
    });
}
exports.addCorsOptions = addCorsOptions;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2xhbWJkYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNka19sYW1iZGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7Ozs7RUFJRTtBQUNGLG1DQUFtQztBQUVuQyxrREFBa0Q7QUFDbEQsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDZDQUE4QztBQUU5QyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUUsTUFBTSxDQUFFLENBQUE7QUFDOUIscUNBQWlDO0FBQ2pDLDhDQUErQztBQUMvQywrREFBZ0g7QUE4Qi9HLENBQUM7QUFHRixNQUFhLFNBQVUsU0FBUSxHQUFHLENBQUMsV0FBVztJQTRDMUMsWUFBWSxLQUFnQixFQUNoQixFQUFVLEVBQUUsS0FBbUI7UUFFdkMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMsNERBQTREO1FBQzVELDRFQUE0RTtRQUM1RSxJQUFJO1FBQ0osbUVBQW1FO1FBQ25FLG1DQUFtQztRQUNuQyx3QkFBd0I7UUFDeEIseUNBQXlDO1FBQ3pDLDRCQUE0QjtRQUM1Qiw0Q0FBNEM7UUFDNUMsaUNBQWlDO1FBQ2pDLDJDQUEyQztRQUMzQyx5QkFBeUI7UUFDekIsdUNBQXVDO1FBQ3ZDLHNCQUFzQjtRQUN0Qiw0Q0FBNEM7UUFDNUMsaUNBQWlDO1FBQ2pDLGlEQUFpRDtRQUNqRCxrREFBa0Q7UUFDbEQsOENBQThDO1FBQzlDLHlCQUF5QjtRQUN6Qix3REFBd0Q7UUFDeEQscUJBQXFCO1FBQ3JCLGdCQUFnQjtRQUNoQixhQUFhO1FBQ2IsUUFBUTtRQUNSLE1BQU07UUFFTiw4RkFBOEY7UUFDOUYsZ0dBQWdHO1FBQ2hHLDhEQUE4RDtRQUM5RCxnR0FBZ0c7UUFDaEcsbUdBQW1HO1FBQ25HLCtEQUErRDtRQUMvRCxrR0FBa0c7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QixrQkFBa0IsRUFBRTtvQkFDaEIscURBQXFELEVBQUUseUZBQXlGO29CQUNoSixvREFBb0QsRUFBRSxLQUFLO29CQUMzRCx5REFBeUQsRUFBRSxTQUFTO29CQUNwRSxxREFBcUQsRUFBRSwrQkFBK0I7aUJBQ3pGO2FBQ0osQ0FBQztRQUNGLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLO1FBQ2xELGdCQUFnQixFQUFFO1lBQ2Qsa0JBQWtCLEVBQUUsdUJBQXVCO1NBQzlDO0tBQ0osQ0FBQyxFQUFFO1FBQ0EsZUFBZSxFQUFFLENBQUM7Z0JBQ2QsVUFBVSxFQUFFLEtBQUs7Z0JBQ2pCLGtCQUFrQixFQUFFO29CQUNoQixxREFBcUQsRUFBRSxJQUFJO29CQUMzRCxxREFBcUQsRUFBRSxJQUFJO29CQUMzRCx5REFBeUQsRUFBRSxJQUFJO29CQUMvRCxvREFBb0QsRUFBRSxJQUFJO2lCQUM3RDthQUNKLENBQUM7S0FDTCxDQUFDLENBQUE7QUFDTixDQUFDO0FBMUJELHdDQTBCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCBhcGkgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheScpXG5pbXBvcnQgbGFtYmRhID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWxhbWJkYScpXG5pbXBvcnQgaWFtID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWlhbScpXG5pbXBvcnQgZWMyID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWVjMicpXG5pbXBvcnQgaW90ID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWlvdCcpXG5pbXBvcnQgd2FmID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLXdhZnYyJyk7XG5pbXBvcnQge0NvZGV9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCJcbmNvbnN0IHBhdGggPSByZXF1aXJlKCBcInBhdGhcIiApXG5pbXBvcnQgeyBDb21tb24gfSBmcm9tICcuL2NvbW1vbidcbmltcG9ydCB7TWFuYWdlZFBvbGljeX0gZnJvbSBcIkBhd3MtY2RrL2F3cy1pYW1cIjtcbmltcG9ydCB7IExhbWJkYVJlc3RBcGksIENmbkF1dGhvcml6ZXIsIExhbWJkYUludGVncmF0aW9uLCBBdXRob3JpemF0aW9uVHlwZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCB7Q0RLU3RhdGljSU9UfSBmcm9tIFwiLi9jZGtfc3RhdGljaW90XCI7XG5pbXBvcnQge0NES0xhbWJkYUxheWVyfSBmcm9tIFwiLi9jZGtfbGFtYmRhbGF5ZXJcIjtcbmltcG9ydCB7Q0RLVGltZXN0cmVhbX0gZnJvbSBcIi4vY2RrX3RpbWVzdHJlYW1cIjtcbmltcG9ydCB7Q2ZuVG9waWNSdWxlfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlvdFwiO1xuaW1wb3J0IExhbWJkYUFjdGlvblByb3BlcnR5ID0gQ2ZuVG9waWNSdWxlLkxhbWJkYUFjdGlvblByb3BlcnR5O1xuaW1wb3J0IHtDREtEeW5hbW9EQn0gZnJvbSBcIi4vY2RrX2R5bmFtb2RiXCI7XG5cblxuaW50ZXJmYWNlIElMYW1iZGFQcm9wcyBleHRlbmRzIGNkay5OZXN0ZWRTdGFja1Byb3BzIHtcbiAgICBwcmVmaXg6IHN0cmluZyxcbiAgICBzdGFnZTogc3RyaW5nLFxuICAgIHV1aWQ6IHN0cmluZyxcbiAgICBsb2dMZXZlbDogc3RyaW5nLFxuICAgIGRiUGFzc3dvcmRLZXk6IHN0cmluZyxcbiAgICBkeW5hbW9EQjogQ0RLRHluYW1vREIsXG4gICAgaHR0cHNQb3J0OiBudW1iZXIsXG4gICAgbGF5ZXI6IENES0xhbWJkYUxheWVyLFxuICAgIGxhbWJkYVRpbWVPdXRTZWNzOiBudW1iZXIsXG4gICAgcmVnaW9uOiBzdHJpbmcsXG4gICAgZ2F0ZXdheVJlcHVibGlzaFRvcGljczogc3RyaW5nLFxuICAgIHNlY3VyaXR5R3JvdXA6IGVjMi5JU2VjdXJpdHlHcm91cCxcbiAgICBkYlNlY3VyaXR5R3JvdXA6IGVjMi5JU2VjdXJpdHlHcm91cCxcbiAgICBjb2duaXRvVXNlcnBvb2xBcm46IHN0cmluZyxcbiAgICBzdGF0aWNJb3Q6IENES1N0YXRpY0lPVCxcbiAgICB0aW1lc3RyZWFtPzogQ0RLVGltZXN0cmVhbSxcbiAgICB2cGM6IGVjMi5JVnBjLFxuICAgIHVzZVNTTzogYm9vbGVhbixcbiAgICBzYW1sTWV0YWRhdGFGaWxlUGF0aDogc3RyaW5nLFxuICAgIHRhZ3M6IHtbbmFtZTogc3RyaW5nXTogYW55fVxufTtcblxuXG5leHBvcnQgY2xhc3MgQ0RLTGFtYmRhIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrIHtcblxuICAgIHByaXZhdGUgbG9jYWxHd0dHUm9sZTogaWFtLlJvbGU7XG4gICAgcHVibGljIGFwaUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBhcGlHdzogYXBpLlJlc3RBcGk7XG4gICAgcHJpdmF0ZSBsYW1iZGFBdXRob3JpemVyOiBDZm5BdXRob3JpemVyO1xuICAgIHB1YmxpYyBnZ0d3TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb25cbiAgICBwdWJsaWMgc3NvQVBJR2F0ZXdheUludm9rZVJvbGU6IGlhbS5Sb2xlO1xuXG4gICAgLy8gVGhlc2UgYXJlIGxhbWJkYXMgY3JlYXRlZCB0byBoYW5kbGUgYWxsIHRoZSBBUEkgY2FsbHMuIFdlIHNhdmUgdGhlbSBzb1xuICAgIC8vIHRoaW5ncyBsaWtlIElPVCBydWxlcyBjYW4gcmVmZXJlbmNlIHRoZW0uXG4gICAgLy9cbiAgICBwdWJsaWMgcHJvamVjdExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBtb2RlbExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBkZXZpY2VMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgZGF0YVR5cGVMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgZGF0YUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1c2VyTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIGxvY2F0aW9uTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgICBwdWJsaWMgYWRtaW5MYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgZmVhdHVyZU1hbmFnZXJMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgZmlybXdhcmVMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgc2V0dGluZ0xhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB0ZW1wbGF0ZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1cGRhdGVMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcblxuICAgIHB1YmxpYyB1aUFkbWluTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpQXV0aExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1aURhdGFMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgdWlEYXRhVHlwZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1aURldmljZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1aU1vZGVsTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpUHJvamVjdExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1aVN0YXJ0TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpVXNlckxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gICAgcHVibGljIGZlYXR1cmVBbGV4YUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmZWF0dXJlQ29ubmVjdExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmZWF0dXJlR3JhZmFuYUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmZWF0dXJlTG9jYXRpb25MYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgZmVhdHVyZVR3aW5MYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgZmVhdHVyZVNtc0xhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCxcbiAgICAgICAgICAgICAgICBpZDogc3RyaW5nLCBwcm9wczogSUxhbWJkYVByb3BzKVxuICAgICAgICB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgICAgIENvbW1vbi5hZGRUYWdzKHRoaXMsIHByb3BzLnRhZ3MpXG5cbiAgICAgICAgLy8gbGV0IGxvY2FsR3dHR1JvbGVOYW1lID0gbmFtZVByZWZpeCArIFwiX2d3X2dnX2xvY2FsX3JvbGVcIjtcbiAgICAgICAgLy8gdGhpcy5sb2NhbEd3R0dSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIG5hbWVQcmVmaXggKyBcIl9nd19nZ19sb2NhbF9yb2xlXCIsXG4gICAgICAgIC8vIHtcbiAgICAgICAgLy8gICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICAgIC8vICAgICByb2xlTmFtZTogbG9jYWxHd0dHUm9sZU5hbWUsXG4gICAgICAgIC8vICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICAvLyAgICAgICAgIFwiR0dcIjogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgIC8vICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVcIlxuICAgICAgICAvLyAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dHcm91cFwiLFxuICAgICAgICAvLyAgICAgICAgICAgICAgICAgICAgICAgICBcImxvZ3M6Q3JlYXRlTG9nU3RyZWFtXCIsXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgIFwibG9nczpQdXRMb2dFdmVudHNcIlxuICAgICAgICAvLyAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCJhcm46YXdzOmxvZ3M6KjoqOipcIl1cbiAgICAgICAgLy8gICAgICAgICAgICAgICAgIH0pXG4gICAgICAgIC8vICAgICAgICAgICAgIF1cbiAgICAgICAgLy8gICAgICAgICB9KVxuICAgICAgICAvLyAgICAgfVxuICAgICAgICAvLyB9KTtcblxuICAgICAgICAvLyBUaGVyZSBhcmUgdGhyZWUga2luZHMgb2YgbGFtYmRhcy4gVGhlIG9uZXMgY2FsbGVkIGJ5IHRoZSBkYXNoYm9hcmQsIHRoZSBvbmVzIGludm9rZWQgYnkgdGhlXG4gICAgICAgIC8vIElPVCBvbmNlIGRhdGEgY29tZXMgaW4gZnJvbSBlYWNoIGRldmljZSAodGhpcyBpbmNsdWRlcyB0aGUgb25lIGludm9rZWQgYnkgdGhlIFNRUyBwcm9jZXNzb3IpLFxuICAgICAgICAvLyBhbmQgdGhlIG9uZXMgY2FsbGVkIGJ5IEdyZWVuZ3Jhc3MgYW5kIHB1c2hlZCBvbnRvIGEgZGV2aWNlLlxuICAgICAgICAvLyBTb21lIG9mIHRoZXNlIG5lZWQgYWNjZXNzIHRvIHRoZSBkYXRhYmFzZS4gQWxsIGRhdGFiYXNlIG1ldGhvZHMgYXJlIHN0b3JlZCBpbiB0d28gbGF5ZXJzIHRoYXRcbiAgICAgICAgLy8gY29udGFpbnMgdGhlIGNvZGUgZm9yIGFjY2Vzc2luZyB0aGUgZGF0YWJhc2UuIE9uZSBsYXllciBjb250YWlucyBweXRob24gREIgZHJpdmVycyBhbmQgdGhlIG90aGVyXG4gICAgICAgIC8vIHRoZSBjb21tb24gY29kZSB0aGF0IGFsbCBsYW1iZGFzIHVzZSB0byBhY2Nlc3MgdGhlIGRhdGFiYXNlLlxuICAgICAgICAvLyBUaG9zZSBsYXllcnMgYXJlIHN0b3JlZCB1bmRlciBsYW1iZGFfc3JjL2xheWVycy8uLi4gYW5kIGFyZSB6aXAgYXJjaGl2ZWQgaW4gdGhlIGZvcm1hdCBleHBlY3RlZFxuICAgICAgICAvLyBieSBsYW1iZGEgbGF5ZXJzLlxuICAgICAgICAvL1xuXG4gICAgICAgIC8vIE5vdyBsZXQncyBjcmVhdGUgdGhlIEFQSSBnYXRld2F5IGZvciB0aGUgY2FsbHMgdGhhdCBuZWVkIGFjY2VzcyBmcm9tIGRhc2hib2FyZCBhbmQgbW9iaWxlXG4gICAgICAgIC8vIGFjY2Vzcy5cbiAgICAgICAgLy9cbiAgICAgICAgbGV0IHJlc3RBcGlOYW1lID0gcHJvcHMucHJlZml4ICsgXCJfcmVzdF9hcGlcIjtcblxuICAgICAgICAvLyBOT1RFOiB3ZSBjcmVhdGUgZGlmZmVyZW50IEFQSXMgZm9yIGVhY2ggc3RhZ2UgdG8gbWFpbnRhaW4gaXNvbGF0aW9uLlxuICAgICAgICAvLyBGb3IgdXNlci1mcmllbmRsaW5lc3MsIHdlIGFsc28gZGVwbG95IGVhY2ggc3RhZ2Ugd2l0aCB0aGUgc3RhZ2UgbmFtZS5cbiAgICAgICAgLy8gRm9yIGV4YW1wbGUsIGZvciB0aGUgJ2Rldicgc3RhZ2UsIHRoZSBuYW1lIG9mIHRoZSBhcGkgd2lsbCBiZSBcIiMjI19kZXZfcmVzdF9hcGlcIlxuICAgICAgICAvLyBhbmQgaXQgd2lsbCBiZSBkZXBsb3llZCB3aXRoIHRoZSAnZGV2JyBzdGFnZSwgc28gdGhlIGVuZHBvaW50IEFQSSBmb3IgaXQgd2lsbFxuICAgICAgICAvLyBlbmQgdXAgYmVpbmcgJ2h0dHBzOi8vLi4uLi4uL2RldicuXG4gICAgICAgIC8vIFRoaXMgbWFrZXMgaXQgZWFzaWVyIHRvIHRlbGwgdGhlbSBhcGFydCBkdXJpbmcgdGVzdGluZy4gSG93ZXZlciwgaXQgbWVhbnNcbiAgICAgICAgLy8gaWYgdXNpbmcgdG9vbHMgbGlrZSBQb3N0bWFuLCB5b3UnbGwgd2FudCB0byBub3Qgb25seSBwb2ludCBpdCBhdCB0aGUgcmlnaHRcbiAgICAgICAgLy8gQVBJIFVSTCwgYnV0IGFsc28gZ2V0IHRoZSBzdGFnZSBuYW1lIGluIHRoZXJlIGNvcnJlY3RseS5cbiAgICAgICAgLy9cbiAgICAgICAgdGhpcy5hcGlHdyA9IG5ldyBhcGkuUmVzdEFwaSh0aGlzLCBpZCArIFwiX3Jlc3RfYXBpXCIsIHtcbiAgICAgICAgICAgIHJlc3RBcGlOYW1lOiByZXN0QXBpTmFtZSxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkFQSSBmb3IgXCIgKyBwcm9wcy5zdGFnZSArIFwiIHN0YWdlXCIsXG4gICAgICAgICAgICBlbmRwb2ludFR5cGVzOiBbIGFwaS5FbmRwb2ludFR5cGUuUkVHSU9OQUwgXSxcbiAgICAgICAgICAgIGRlcGxveTogdHJ1ZSxcbiAgICAgICAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICBzdGFnZU5hbWU6IHByb3BzLnN0YWdlLFxuICAgICAgICAgICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpLk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICAgICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IGZhbHNlIC8vIE5PVEU6IHNldHRpbmcgdGhpcyB0byB0cnVlIG9uIGludGVybmFsIHNhbmRib3ggc3lzdGVtcyB3aWxsIGZsYWcgYSBTRVZFUkUgZXJyb3IuXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGkuQ29ycy5BTExfT1JJR0lOU1xuICAgICAgICAgICAgICAgIC8vIGFsbG93TWV0aG9kczogW1wiR0VUXCIsIFwiUE9TVFwiLCBcIlBVVFwiLCBcIkRFTEVURVwiLCBcIk9QVElPTlNcIl1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFVuY29tbWVudCB0aGUgZm9sbG93aW5nIGlmIHlvdSB3YW50IHRvIGFzc2lnbiBhIGN1c3RvbSBkb21haW5cbiAgICAgICAgICAgIC8vIHRvIHRoZSBBUElcbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyAsIGRvbWFpbk5hbWU6IHtcbiAgICAgICAgICAgIC8vICAgICBkb21haW5OYW1lOiBcImFwaS5teWRvbWFpbi5jb21cIixcbiAgICAgICAgICAgIC8vICAgICBjZXJ0aWZpY2F0ZTogYWNtQ2VydGlmaWNhdGVGb3JBUElEb21haW5cbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIC8vXG4gICAgICAgICB9KTtcblxuICAgICAgICAvLyBMZXQncyBhZGQgdGhlIFdBRiB0byB0aGUgQVBJIGdhdGV3YXkgZm9yIGJldHRlciBzZWN1cml0eVxuICAgICAgICAvL1xuICAgICAgICB0aGlzLmFkZFdBRlRvQVBJR2F0ZXdheShwcm9wcyk7XG5cbiAgICAgICAgLy8gSWYgdXNpbmcgU1NPLCB3ZSBkb24ndCBuZWVkIGxhbWJkYSBhdXRob3JpemVycyBhbmQgY29nbml0byB1c2VyIHBvb2xzLlxuICAgICAgICAvLyBJbnN0ZWFkLCB3ZSdsbCBiZSB1c2luZyBJQU0uIElmIHVzaW5nIFNTTywgaG93ZXZlciwgd2UgbmVlZCB0byBjcmVhdGVcbiAgICAgICAgLy8gYW4gU1NPIHJvbGUgdGhhdCBhbGxvd3MgYWNjZXNzIHRvIHRoZSBBUEkgZ2F0ZXdheS4gRm9yIGRldmVsb3BtZW50IHdlJ3JlXG4gICAgICAgIC8vIGtlZXBpbmcgaXQgb3Blbi4gQnV0IGZvciBwcm9kdWN0aW9uIGl0IHNob3VsZCBiZSBsaW1pdGVkIHNvIG9ubHkgYWNjZXNzIGZyb21cbiAgICAgICAgLy8gdGhlIGRhc2hib2FyZCBpcyBhbGxvd2VkLlxuICAgICAgICAvL1xuICAgICAgICAvLyBGb3IgdGhpcyB0byB3b3JrLCB3ZSBuZWVkIHRoZSBwYXRoIHRvIHRoZSBzYW1sLW1ldGFkYXRhLWRvY3VtZW50LnhtbCBmaWxlLlxuICAgICAgICAvLyBUaGUgaW5zdGFsbGVyIGFza3MgZm9yIHRoaXMgYW5kIHN0b3JlcyBpdCBpbiB0aGUgYm9vdHN0cmFwIGZpbGUuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIE1vcmUgaW5mbyBoZXJlOiBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2FwaS9sYXRlc3QvZG9jcy9hd3MtaWFtLXJlYWRtZS5odG1sXG4gICAgICAgIC8vXG4gICAgICAgIGlmIChwcm9wcy51c2VTU08pIHtcbiAgICAgICAgICAgIGxldCBzc29Sb2xlTmFtZSA9IFwic2ltcGxlaW90X3Nzb19hcGlfaW52b2tlX3JvbGVcIlxuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGNvbW1lbnRlZCBmb3Igbm93IHVudGlsIGl0IGNhbiBiZSBmdXJ0aGVyIHRlc3RlZCB3aXRoIGRpZmZlcmVudCBTQU1MIElEUCBwcm92aWRlcnMuXG4gICAgICAgICAgICAvLyBGb3Igbm93LCB0byBtYWtlIHRoaXMgd29yaywgc2V0IHVwIHlvdXIgQVdTIFNTTyBhbmQgaW4gSUFNIGNyZWF0ZSBhIFJvbGUgd2l0aCBTQU1MIDIuMC4gQ2hvb3NlXG4gICAgICAgICAgICAvLyBcIkJvdGggQ29uc29sZSBhbmQgUHJvZ3JhbW1hdGljIEFjY2Vzc1wiIHRoZW4gYWRkIGFuIEFtYXpvbkFQSUdhdGV3YXlJbnZva2VGdWxsQWNjZXNzIHBvbGljeSB0byBpdC5cbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyBjb25zdCBwcm92aWRlciA9IG5ldyBpYW0uU2FtbFByb3ZpZGVyKHRoaXMsICdTU09fU0FNTF9Qcm92aWRlcicsIHtcbiAgICAgICAgICAgIC8vICAgICBtZXRhZGF0YURvY3VtZW50OiBpYW0uU2FtbE1ldGFkYXRhRG9jdW1lbnQuZnJvbUZpbGUocHJvcHMuc2FtbE1ldGFkYXRhRmlsZVBhdGgpLFxuICAgICAgICAgICAgLy8gfSk7XG4gICAgICAgICAgICAvLyB0aGlzLnNzb0FQSUdhdGV3YXlJbnZva2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIGlkICsgXCJzc29fc2FtbF9yb2xlXCIsIHtcbiAgICAgICAgICAgIC8vICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2FtbENvbnNvbGVQcmluY2lwYWwocHJvdmlkZXIpLFxuICAgICAgICAgICAgLy8gICAgIHJvbGVOYW1lOiBzc29Sb2xlTmFtZSxcbiAgICAgICAgICAgIC8vICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQW1hem9uQVBJR2F0ZXdheUludm9rZUZ1bGxBY2Nlc3NcIilcbiAgICAgICAgICAgIC8vICAgICAgICAgXVxuICAgICAgICAgICAgLy8gICAgIH1cbiAgICAgICAgICAgIC8vICk7XG5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEFQSSBBdXRob3JpemVyIHRoYXQgdXNlcyBDb2duaXRvIFVzZXIgcG9vbCB0byBBdXRob3JpemUgdXNlcnMuXG4gICAgICAgICAgICBsZXQgYXV0aG9yaXplck5hbWUgPSBwcm9wcy5wcmVmaXggKyBcIl9jb2duaXRvX2F1dGhvcml6ZXJcIlxuICAgICAgICAgICAgdGhpcy5sYW1iZGFBdXRob3JpemVyID0gbmV3IENmbkF1dGhvcml6ZXIodGhpcywgaWQgKyBcIl9jb2duaXRvX2F1dGhvcml6ZXJcIiwge1xuICAgICAgICAgICAgICAgIHJlc3RBcGlJZDogdGhpcy5hcGlHdy5yZXN0QXBpSWQsXG4gICAgICAgICAgICAgICAgbmFtZTogYXV0aG9yaXplck5hbWUsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0NPR05JVE9fVVNFUl9QT09MUycsXG4gICAgICAgICAgICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgICAgICAgcHJvdmlkZXJBcm5zOiBbcHJvcHMuY29nbml0b1VzZXJwb29sQXJuXSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGlzIGF1dGhvcml6ZXIgaXMgYW4gZXhhbXBsZSBmb3IgY3JlYXRpbmcgb25lIGFuZCB2YWxpZGF0aW5nIGl0IHVzaW5nIGEgbGFtYmRhLlxuICAgICAgICAvLyBXZSdyZSBub3QgdXNpbmcgaXQgaGVyZSwgYnV0IGl0J3MgaGVyZSBpZiBzb21lb25lIHdhbnRzIHRvIHVzZSB0aGVpciBvd25cbiAgICAgICAgLy8gdXNlciBhdXRob3JpemF0aW9uIHN5c3RlbSBpbnN0ZWFkIG9mIENvZ25pdG8uXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGxldCBhcGlBdXRob3JpemVyTmFtZSA9IG5hbWVQcmVmaXggKyBcIl9hdXRoX2F1dGhvcml6ZXJcIjtcbiAgICAgICAgLy8gdGhpcy5hcGlBdXRob3JpemVyID0gbmV3IGFwaS5SZXF1ZXN0QXV0aG9yaXplcih0aGlzLCBhcGlBdXRob3JpemVyTmFtZSwge1xuICAgICAgICAvLyAgICAgaGFuZGxlcjogdGhpcy5hcGlBdXRob3JpemVyTGFtYmRhLFxuICAgICAgICAvLyAgICAgaWRlbnRpdHlTb3VyY2VzOiBbYXBpLklkZW50aXR5U291cmNlLmhlYWRlcignQXV0aG9yaXphdGlvbicpXVxuICAgICAgICAvLyB9KVxuXG4gICAgICAgIC8vIFRoZXNlIGFyZSBwcm9wZXJ0aWVzIGZvciBwYXNzaW5nIGRvd24gdG8gZWFjaCBmdW5jdGlvbi5cbiAgICAgICAgLy9cblxuICAgICAgIC8vIHRoaXMucm9sZUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgLy8gICAgIFwicm9sZVwiLFxuICAgICAgIC8vICAgICBcImFwaV9yb2xlXCIsXG4gICAgICAgLy8gICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfcm9sZVwiLFxuICAgICAgIC8vICAgICBsYW1iZGFQYXJhbXMsIGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIC8vIFdlIGNyZWF0ZSBhIG1hcCB3aXRoIHRoZSBuYW1lIG9mIEFQSSBwcmVmaXhlcyBhbmQgdGhlIGFjdHVhbCByZXNvdXJjZXMgaW4gdGhlbS5cbiAgICAgICAvLyBMYXRlciBvbiwgd2UgbG9va3VwIGVhY2ggcGFyZW50IHJlc291cmNlIGluIHRoaXMgdGFibGUgc28gd2Uga25vdyB3aGVyZSB0b1xuICAgICAgIC8vIGF0dGFjaCBlYWNoIFJFU1QgQVBJIHBhdGggdG8uIEZvciBleGFtcGxlLCBpZiBkZWZpbml0aW5nIFwiL3VpL3VzZXJcIiwgd2VcbiAgICAgICAvLyB3b3VsZCBhZGQgXCJ1c2VyXCIgdG8gdGhlIFwidWlcIiByZXNvdXJjZSB3aGljaCBpcyBhbHJlYWR5IGRlZmluZWQgdW5kZXIgdGhlIHJvb3QuXG5cbiAgICAgICBsZXQgYXBpUm9vdCA9IHRoaXMuYXBpR3cucm9vdC5hZGRSZXNvdXJjZSgndjEnKTtcbiAgICAgICBsZXQgdWlSZXNvdXJjZSA9IGFwaVJvb3QuYWRkUmVzb3VyY2UoXCJ1aVwiKVxuICAgICAgIGxldCBmZWF0dXJlUmVzb3VyY2UgPSBhcGlSb290LmFkZFJlc291cmNlKFwiZmVhdHVyZVwiKVxuXG4gICAgICAgdGhpcy5wcm9qZWN0TGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJwcm9qZWN0XCIsXG4gICAgICAgICAgIFwiYXBpX3Byb2plY3RcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV9wcm9qZWN0XCIsXG4gICAgICAgICAgIHByb3BzLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLm1vZGVsTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJtb2RlbFwiLFxuICAgICAgICAgICBcImFwaV9tb2RlbFwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX21vZGVsXCIsXG4gICAgICAgICAgIHByb3BzLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmRhdGFUeXBlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJkYXRhdHlwZVwiLFxuICAgICAgICAgICBcImFwaV9kYXRhdHlwZVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX2RhdGF0eXBlXCIsXG4gICAgICAgICAgIHByb3BzLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmRhdGFMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcImRhdGFcIixcbiAgICAgICAgICAgXCJhcGlfZGF0YVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX2RhdGFcIixcbiAgICAgICAgICAgcHJvcHMsIGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgICAvLyBBbGxvdyB0aGUgZGF0YSBzZXQgQVBJIHRvIHJlYWQvd3JpdGUgdG8gdGhlIGR5bmFtb2RiIHRhYmxlXG4gICAgICAgIC8vXG4gICAgICAgIHByb3BzLmR5bmFtb0RCLmR5bmFtb0RCVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZGF0YUxhbWJkYSk7XG5cbiAgICAgICB0aGlzLmRldmljZUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgIFwiZGV2aWNlXCIsXG4gICAgICAgICAgIFwiYXBpX2RldmljZVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX2RldmljZVwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmFkbWluTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJhZG1pblwiLFxuICAgICAgICAgICBcImFwaV9hZG1pblwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX2FkbWluXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuZmVhdHVyZU1hbmFnZXJMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcImZlYXR1cmVtYW5hZ2VyXCIsXG4gICAgICAgICAgIFwiYXBpX2ZlYXR1cmVtYW5hZ2VyXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfZmVhdHVyZW1hbmFnZXJcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy5maXJtd2FyZUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgIFwiZmlybXdhcmVcIixcbiAgICAgICAgICAgXCJhcGlfZmlybXdhcmVcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV9maXJtd2FyZVwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnNldHRpbmdMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcInNldHRpbmdcIixcbiAgICAgICAgICAgXCJhcGlfc2V0dGluZ1wiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX3NldHRpbmdcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgICAvLyBJZiB3ZSdyZSBub3QgdXNpbmcgU1NPLCB0aGVuIHdlIHdhbnQgdG8gZGVmaW5lIHVzZXItbWFuYWdlbWVudCBBUElzXG4gICAgICAgICAvLyB0aGF0IGFjdCBhcyBmcm9udCBmb3IgQ29nbml0byB1c2VyIHBvb2xzLiBFdmVudHVhbGx5LCB3ZSdsbCBuZWVkIHJvbGUgc3VwcG9ydFxuICAgICAgICAgLy8gYXMgd2VsbC5cbiAgICAgICAgIC8vXG4gICAgICAgIGlmICghcHJvcHMudXNlU1NPKSB7XG4gICAgICAgICAgICB0aGlzLnVzZXJMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgICAgICAgXCJ1c2VyXCIsXG4gICAgICAgICAgICAgICAgXCJhcGlfdXNlclwiLFxuICAgICAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV91c2VyXCIsXG4gICAgICAgICAgICAgICAgcHJvcHMsIGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgdGhpcy5sb2NhdGlvbkxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgIFwibG9jYXRpb25cIixcbiAgICAgICAgICAgXCJhcGlfbG9jYXRpb25cIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV9sb2NhdGlvblwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnRlbXBsYXRlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJ0ZW1wbGF0ZVwiLFxuICAgICAgICAgICBcImFwaV90ZW1wbGF0ZVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX3RlbXBsYXRlXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudXBkYXRlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJ1cGRhdGVcIixcbiAgICAgICAgICAgXCJhcGlfdXBkYXRlXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfdXBkYXRlXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudWlBZG1pbkxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwiYWRtaW5cIixcbiAgICAgICAgICAgXCJ1aV9hcGlfYWRtaW5cIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvdWkvaW90X3VpX2FwaV9hZG1pblwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpQXV0aExhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwiYXV0aFwiLFxuICAgICAgICAgICBcInVpX2FwaV9hdXRoXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfYXV0aFwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpRGF0YUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwiZGF0YVwiLFxuICAgICAgICAgICBcInVpX2FwaV9kYXRhXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfZGF0YVwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpRGF0YVR5cGVMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICB1aVJlc291cmNlLFxuICAgICAgICAgICBcImRhdGF0eXBlXCIsXG4gICAgICAgICAgIFwidWlfYXBpX2RhdGF0eXBlXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfZGF0YXR5cGVcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy51aURldmljZUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwiZGV2aWNlXCIsXG4gICAgICAgICAgIFwidWlfYXBpX2RldmljZVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS91aS9pb3RfdWlfYXBpX2RldmljZVwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpTW9kZWxMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICB1aVJlc291cmNlLFxuICAgICAgICAgICBcIm1vZGVsXCIsXG4gICAgICAgICAgIFwidWlfYXBpX21vZGVsXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfbW9kZWxcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy51aVByb2plY3RMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICB1aVJlc291cmNlLFxuICAgICAgICAgICBcInByb2plY3RcIixcbiAgICAgICAgICAgXCJ1aV9hcGlfcHJvamVjdFwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS91aS9pb3RfdWlfYXBpX3Byb2plY3RcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy51aVN0YXJ0TGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgdWlSZXNvdXJjZSxcbiAgICAgICAgICAgXCJzdGFydFwiLFxuICAgICAgICAgICBcInVpX2FwaV9zdGFydFwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS91aS9pb3RfdWlfYXBpX3N0YXJ0XCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudWlVc2VyTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgdWlSZXNvdXJjZSxcbiAgICAgICAgICAgXCJ1c2VyXCIsXG4gICAgICAgICAgIFwidWlfYXBpX3VzZXJcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvdWkvaW90X3VpX2FwaV91c2VyXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIC8vIFRoZXNlIGFyZSBhbGwgb3B0aW9uYWwuIFdlJ3JlIGRlZmluaW5nIGl0IGhlcmUsIGJ1dCBpdCByZWFsbHkgc2hvdWxkIGJlIG1vdmVkXG4gICAgICAgLy8gdG8gYSBtb3JlIGR5bmFtaWMgZmVhdHVyZSBtYW5hZ2VyIHNvIHdlIGNhbiBhY3RpdmF0ZS9hZGQvcmVtb3ZlIHRoZW0gbGlrZSBwbHVnaW5zLlxuICAgICAgIC8vXG4gICAgICAgdGhpcy5mZWF0dXJlQWxleGFMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBmZWF0dXJlUmVzb3VyY2UsXG4gICAgICAgICAgIFwiYWxleGFcIixcbiAgICAgICAgICAgXCJmZWF0dXJlX2FwaV9hbGV4YVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9mZWF0dXJlL2lvdF9mZWF0dXJlX2FwaV9hbGV4YVwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmZlYXR1cmVDb25uZWN0TGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgZmVhdHVyZVJlc291cmNlLFxuICAgICAgICAgICBcImNvbm5lY3RcIixcbiAgICAgICAgICAgXCJmZWF0dXJlX2FwaV9jb25uZWN0XCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2ZlYXR1cmUvaW90X2ZlYXR1cmVfYXBpX2Nvbm5lY3RcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy5mZWF0dXJlR3JhZmFuYUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGZlYXR1cmVSZXNvdXJjZSxcbiAgICAgICAgICAgXCJncmFmYW5hXCIsXG4gICAgICAgICAgIFwiZmVhdHVyZV9hcGlfZ3JhZmFuYVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9mZWF0dXJlL2lvdF9mZWF0dXJlX2FwaV9jb25uZWN0XCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuZmVhdHVyZUxvY2F0aW9uTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgZmVhdHVyZVJlc291cmNlLFxuICAgICAgICAgICBcImxvY2F0aW9uXCIsXG4gICAgICAgICAgIFwiZmVhdHVyZV9hcGlfbG9jYXRpb25cIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvZmVhdHVyZS9pb3RfZmVhdHVyZV9hcGlfbG9jYXRpb25cIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy5mZWF0dXJlVHdpbkxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGZlYXR1cmVSZXNvdXJjZSxcbiAgICAgICAgICAgXCJ0d2luXCIsXG4gICAgICAgICAgIFwiZmVhdHVyZV9hcGlfdHdpblwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9mZWF0dXJlL2lvdF9mZWF0dXJlX2FwaV90d2luXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuZmVhdHVyZVNtc0xhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGZlYXR1cmVSZXNvdXJjZSxcbiAgICAgICAgICAgXCJzbXNcIixcbiAgICAgICAgICAgXCJmZWF0dXJlX2FwaV9zbXNcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvZmVhdHVyZS9pb3RfZmVhdHVyZV9hcGlfc21zXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcbiAgICAgICAvL1xuICAgICAgIC8vIFRoaXMgbGFtYmRhIGlzIGdvaW5nIHRvIGJlIHVzZWQgZm9yIG9uLWRldmljZSBHRyBkZXBsb3ltZW50LiBUaGVyZSdzIG5vIGV4dGVybmFsIEFQSSBmb3IgdGhpcy5cbiAgICAgICAvLyBXZSBkbyBuZWVkIHRvIHNhdmUgdGhlIEFSTiwgdGhvdWdoLCBpbiBjYXNlIGl0IGhhcyBiZSBwYXNzZWQgb24gdG8gdGhlIENMSSBoYW5kbGVyLlxuICAgICAgIC8vXG4gICAgICAgLy8gdGhpcy5nZ0d3TGFtYmRhID0gdGhpcy5kZWZpbmVMb2NhbEdHTGFtYmRhKG5hbWVQcmVmaXgsXG4gICAgICAgLy8gICAgIFwiZ3dfZ2dfbGFtYmRhXCIsXG4gICAgICAgLy8gICAgIGdhdGV3YXlSZXB1Ymxpc2hUb3BpY3MsXG4gICAgICAgLy8gICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2dhdGV3YXlfbGFtYmRhXCIpXG4gICAgICAgLy9cbiAgICAgICAvLyBDb21tb24ub3V0cHV0KHRoaXMsIFwiZ2dHd0xhbWJkYUFSTlwiLCB0aGlzLmdnR3dMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICAgLy8gIFwiR2F0ZXdheSBHRyBsYW1iZGEgQVJOXCIpXG5cbiAgICAgICAvLyBEZWZpbmUgSU9UIHJ1bGVzIHRoYXQgc2VcbiAgICAgICAgICAgIC8vIG5kIHRyYWZmaWMgdG8gbGFtYmRhcyAoYW5kIGdpdmUgdGhlbSBwZXJzbWlzc2lvbilcbiAgICAgICAvL1xuICAgICAgIHRoaXMuZGVmaW5lSU9UUnVsZXMocHJvcHMpO1xuICAgIH1cblxuICAgIC8vIE5PVEU6IGF0IHRoaXMgcG9pbnQgaW4gdGltZSwgb24tZGV2aWNlIGxhbWJkYXMgY2FuIGJlIHVwIHRvIFB5dGhvbiAzLjcuXG4gICAgLy8gRWxzZXdoZXJlLCB0aGV5IGNhbiBnbyBoaWdoZXIuIFNvIHdlIGhhdmUgdG8gaGFyZGNvZGUgaXQgaGVyZS5cbiAgICAvL1xuICAgIC8vIGRlZmluZUxvY2FsR0dMYW1iZGEocHJlZml4OiBzdHJpbmcsIGxhbWJkYU5hbWU6IHN0cmluZyxcbiAgICAvLyAgICAgICAgICAgICAgICAgICAgZ2F0ZXdheVJlcHVibGlzaFRvcGljczogc3RyaW5nLFxuICAgIC8vICAgICAgICAgICAgICAgICAgICBwYXRoVG9MYW1iZGE6IHN0cmluZykge1xuICAgIC8vICAgICBsZXQgZnVuY3Rpb25OYW1lID0gcHJlZml4ICsgXCJfXCIgKyBsYW1iZGFOYW1lXG4gICAgLy8gICAgIGxldCBsYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgcHJlZml4ICsgbGFtYmRhTmFtZSwge1xuICAgIC8vICAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfNyxcbiAgICAvLyAgICAgICAgIGhhbmRsZXI6IFwibWFpbi5sYW1iZGFfaGFuZGxlclwiLFxuICAgIC8vICAgICAgICAgZnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUsXG4gICAgLy8gICAgICAgICByb2xlOiB0aGlzLmxvY2FsR3dHR1JvbGUsXG4gICAgLy8gICAgICAgICB0aW1lb3V0OiBjb3JlLkR1cmF0aW9uLnNlY29uZHMoTEFNQkRBX1RJTUVPVVRfU0VDUyksXG4gICAgLy8gICAgICAgICBjb2RlOiBuZXcgbGFtYmRhLkFzc2V0Q29kZShwYXRoVG9MYW1iZGEpLFxuICAgIC8vICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAvLyAgICAgICAgICAgICBcIk1RVFRfU1VCXCI6IGdhdGV3YXlSZXB1Ymxpc2hUb3BpY3NcbiAgICAvLyAgICAgICAgIH1cbiAgICAvLyAgICAgfSk7XG4gICAgLy8gICAgIHJldHVybiBsYW1iZGFGdW5jdGlvblxuICAgIC8vIH1cblxuICAgIC8qXG4gICAgICogU2VjdXJpdHkgYXVkaXQgcmVxdWlyZXMgYSBzZXBhcmF0ZSByb2xlIHBlciBsYW1iZGEuXG4gICAgICovXG4gICAgY3JlYXRlSUFNUm9sZShsYW1iZGFOYW1lOiBzdHJpbmcsIHByb3BzOiBJTGFtYmRhUHJvcHMpIDogaWFtLlJvbGUge1xuXG4gICAgICAgIGxldCBsYW1iZGFFeGVjUm9sZU5hbWUgPSBcImxhbWJkYV9pYW1fcm9sZV9cIiArIGxhbWJkYU5hbWU7XG5cbiAgICAgICAgLy8gTk9URTogdGhlcmUncyBhIG1heCBvZiAxMCBtYW5hZ2VkIHBvbGljaWVzLiBJZiBtb3JlIHRoYW4gdGhhdCwgZGVwbG95bWVudCB3aWxsIGZhaWwuXG4gICAgICAgIC8vIEFsc28sIGJlZm9yZSBmaW5hbCByZWxlYXNlLCB3ZSBuZWVkIHRvIG1ha2UgdGhlc2UgbmFycm93ZXIuXG5cbiAgICAgICAgbGV0IGxhbWJkYUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgIGxhbWJkYUV4ZWNSb2xlTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgICAgICAgICAgIHJvbGVOYW1lOiBsYW1iZGFFeGVjUm9sZU5hbWUsXG4gICAgICAgICAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgICAgICAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQW1hem9uUkRTRnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBbWF6b25EeW5hbW9EQkZ1bGxBY2Nlc3NcIiksXG4gICAgICAgICAgICAgICAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiSUFNRnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBbWF6b25TM0Z1bGxBY2Nlc3NcIiksXG4gICAgICAgICAgICAgICAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiU2VjcmV0c01hbmFnZXJSZWFkV3JpdGVcIiksXG4gICAgICAgICAgICAgICAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQVdTR3JlZW5ncmFzc0Z1bGxBY2Nlc3NcIiksXG4gICAgICAgICAgICAgICAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQVdTSW9URnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhVlBDQWNjZXNzRXhlY3V0aW9uUm9sZVwiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBbWF6b25UaW1lc3RyZWFtRnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBbWF6b25TU01GdWxsQWNjZXNzXCIpXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICAgICAgICAgICAgICAnYXNzdW1lX3JvbGUnOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgJ2ludm9rZV9sYW1iZGEnOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibGFtYmRhOmludm9rZUZ1bmN0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxhbWJkYTppbnZva2VBc3luY1wiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZGF0ZV9jbG91ZGZyb250JzogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImNsb3VkZnJvbnQ6Q3JlYXRlSW52YWxpZGF0aW9uXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgIC8qIFRoaXMgaXMgc28gd2UgY2FuIHdyaXRlIGxvY2F0aW9uIGRhdGEgdG8gQVdTIExvY2F0aW9uIHRyYWNrZXJzICovXG4gICAgICAgICAgICAgICAgICAgICdnZW9fbG9jYXRpb25fcm9sZSc6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86U2VhcmNoUGxhY2VJbmRleEZvclRleHRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkNyZWF0ZVBsYWNlSW5kZXhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkRlbGV0ZVBsYWNlSW5kZXhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkJhdGNoRGVsZXRlRGV2aWNlUG9zaXRpb25IaXN0b3J5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdlbzpEZWxldGVUcmFja2VyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdlbzpBc3NvY2lhdGVUcmFja2VyQ29uc3VtZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOlVwZGF0ZVRyYWNrZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkNyZWF0ZVRyYWNrZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkxpc3RQbGFjZUluZGV4ZXNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkNyZWF0ZVJvdXRlQ2FsY3VsYXRvclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86QmF0Y2hVcGRhdGVEZXZpY2VQb3NpdGlvblwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICAvKiBUaGlzIGlzIHNvIHdlIGNhbiBzZW5kIHByb3Zpc2lvbmluZyBtZXNzYWdlcyB2aWEgU01TLiAqL1xuICAgICAgICAgICAgICAgICAgICAnc2VuZF9zbXMnOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibW9iaWxldGFyZ2V0aW5nOlNlbmRNZXNzYWdlc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJtb2JpbGV0YXJnZXRpbmc6U2VuZFVzZXJzTWVzc2FnZXNcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgICAgcmV0dXJuIGxhbWJkYUV4ZWN1dGlvblJvbGU7XG4gICAgfVxuXG4gICAgICAvLyBTZXQgdXAgSU9UIGFjdGlvbnMgdGhhdCBpbnZva2UgYSBsYW1iZGEuIFdlIHVzZWQgdG8gaGF2ZSB0aGlzIGluIGEgc2VwYXJhdGVcbiAgICAgIC8vIHN0YWNrIGJ1dCB3ZXJlIGdldHRpbmcgbmFzdHkgY2lyY3VsYXIgcmVmZXJlbmNlcywgc28gbm93IGl0J3MgZGVmaW5lZCBoZXJlLlxuICAgICAgLy9cbiAgICAgIC8vIFRoaXMgSU9UIHJ1bGUgc2VuZHMgYW55IGNoYW5nZXMgaW4gZGF0YSBmcm9tIHRoZSBkZXZpY2Ugc2lkZSB0byB0aGUgbW9uaXRvclxuICAgICAgLy8gYW5kIGxhbWJkYS4gRGF0YVR5cGVzIG1hcmtlZCBhcyAnc2hvd19vbl90d2luJyB3aWxsIGJlIHJlLWJyb2FkY2FzdCB0byBhIG1vbml0b3JcbiAgICAgIC8vIHRvcGljIHNvIHRoZXkgY2FuIGJlIHNob3duIG9uIHRoZSBjb25zb2xlLlxuICAgICAgLy9cbiAgICBkZWZpbmVJT1RSdWxlcyhwcm9wczogSUxhbWJkYVByb3BzKSB7XG4gICAgICAgY29uc3QgbGFtYmRhSW90QWN0aW9uOiBMYW1iZGFBY3Rpb25Qcm9wZXJ0eSA9IHtcbiAgICAgICAgICAgIGZ1bmN0aW9uQXJuOiB0aGlzLmRhdGFMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICAgfTtcblxuICAgICAgIGNvbnN0IGlvdERhdGFSdWxlID0gbmV3IGlvdC5DZm5Ub3BpY1J1bGUodGhpcywgJ2lvdF9sYW1iZGFfZndkX3J1bGUnLCB7XG4gICAgICAgICAgICB0b3BpY1J1bGVQYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYW1iZGE6IGxhbWJkYUlvdEFjdGlvbixcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJ1bGVEaXNhYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgc3FsOiBgU0VMRUNUICogRlJPTSAnc2ltcGxlaW90X3YxL2FwcC9kYXRhLyMnYCxcbiAgICAgICAgICAgICAgICBhd3NJb3RTcWxWZXJzaW9uOiAnMjAxNi0wMy0yMycsXG4gICAgICAgICAgICB9LFxuICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdlIG5lZWQgdG8gZ2l2ZSBJT1QgcGVybWlzc2lvbiB0byBzZW5kIHRoZSBkYXRhIHRvIGxhbWJkYSBvdGhlcndpc2UgaXQgZmFpbHMuXG4gICAgICAgIC8vXG4gICAgICAgdGhpcy5kYXRhTGFtYmRhLmFkZFBlcm1pc3Npb24oJ2lvdF9hbGxvd19sYW1iZGFfaW52b2tlX3J1bGUnLCB7XG4gICAgICAgICAgICBwcmluY2lwYWw6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnaW90LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgICAgIHNvdXJjZUFybjogaW90RGF0YVJ1bGUuYXR0ckFybixcbiAgICAgICB9KTtcblxuICAgICAgIC8vIFdlIHNldCB1cCBhIHNlcGFyYXRlIHJ1bGUsIHdoZXJlIC4uLi9jaGVja3VwZGF0ZS8uLi4gTVFUVCBtZXNzYWdlcyBhcmUgc2VudCBvdmVyIHRvXG4gICAgICAgLy8gdGhlIGxhbWJkYSB0aGF0IGhhbmRsZXMgdXBkYXRlcy5cbiAgICAgICAvL1xuICAgICAgIGNvbnN0IGxhbWJkYVVwZGF0ZUFjdGlvbjogTGFtYmRhQWN0aW9uUHJvcGVydHkgPSB7XG4gICAgICAgICAgICBmdW5jdGlvbkFybjogdGhpcy51cGRhdGVMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICAgfTtcbiAgICAgICBjb25zdCBpb3RVcGRhdGVSdWxlID0gbmV3IGlvdC5DZm5Ub3BpY1J1bGUodGhpcywgJ2lvdF9sYW1iZGFfdXBkYXRlX3J1bGUnLCB7XG4gICAgICAgICAgICB0b3BpY1J1bGVQYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYW1iZGE6IGxhbWJkYVVwZGF0ZUFjdGlvbixcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJ1bGVEaXNhYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgc3FsOiBgU0VMRUNUICogRlJPTSAnc2ltcGxlaW90X3YxL2NoZWNrdXBkYXRlLyMnYCxcbiAgICAgICAgICAgICAgICBhd3NJb3RTcWxWZXJzaW9uOiAnMjAxNi0wMy0yMycsXG4gICAgICAgICAgICB9LFxuICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdlIG5lZWQgdG8gZ2l2ZSBJT1QgcGVybWlzc2lvbiB0byBzZW5kIHRoZSBkYXRhIHRvIGxhbWJkYSBvdGhlcndpc2UgaXQgZmFpbHMuXG4gICAgICAgIC8vXG4gICAgICAgdGhpcy51cGRhdGVMYW1iZGEuYWRkUGVybWlzc2lvbignaW90X2FsbG93X2ludm9rZV9sYW1iZGFfcGVybWlzc2lvbicsIHtcbiAgICAgICAgICAgIHByaW5jaXBhbDogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdpb3QuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgICAgc291cmNlQXJuOiBpb3RVcGRhdGVSdWxlLmF0dHJBcm4sXG4gICAgICAgfSk7XG4gICAgfVxuXG4gICAgYWRkV0FGVG9BUElHYXRld2F5KHByb3BzOiBJTGFtYmRhUHJvcHMpIHtcblxuICAgICAgICAvLyBGb3Igc2VjdXJpdHkgcmVhc29ucywgd2UgYWxzbyBhZGQgYSBXZWIgQXBwbGljYXRpb24gRmlyZXdhbGwgaW4gZnJvbnQgb2YgdGhlIEFQSVxuICAgICAgICAvLyBHYXRld2F5LiBUaGlzIHVzZWQgdG8gYmUgaW4gYSBzZXBhcmF0ZSBzdGFjayBidXQgaGFkIHRvIGJlIG1vdmVkIGhlcmUgdG8gYXZvaWRcbiAgICAgICAgLy8gY2lyY3VsYXIgcmVmZXJlbmNlcy5cblxuICAgICAgICAvLyBSb3V0aW5lIHRvIHNldCB1cCBXQUYgcnVsZXMuIERpcmVjdGx5IGJhc2VkIG9uOlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vY2RrLXBhdHRlcm5zL3NlcnZlcmxlc3MvYmxvYi9tYWluL3RoZS13YWYtYXBpZ2F0ZXdheS90eXBlc2NyaXB0L2xpYi90aGUtd2FmLXN0YWNrLnRzXG5cbiAgICAgICAgbGV0IHdhZlJ1bGVzOkFycmF5PHdhZi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5PiAgPSBbXTtcblxuICAgICAgICAvLyBBV1MgTWFuYWdlZCBSdWxlc1xuICAgICAgICAvLyBUaGVzZSBhcmUgYmFzaWMgcnVsZXMuIE5vdGUgdGhhdCBpdCBleGNsdWRlcyBzaXplIHJlc3RyaWN0aW9ucyBvbiB0aGUgYm9keVxuICAgICAgICAvLyBzbyBmaWxlIHVwbG9hZC9kb3dubG9hZHMuIElmIHRoZXJlIGFyZSBpc3N1ZXMgd2l0aCB0aGlzLCB5b3UgbWF5IHdhbnQgdG9cbiAgICAgICAgLy8gYWRqdXN0IHRoaXMgcnVsZS5cbiAgICAgICAgLy9cbiAgICAgICAgbGV0IGF3c01hbmFnZWRSdWxlczp3YWYuQ2ZuV2ViQUNMLlJ1bGVQcm9wZXJ0eSAgPSB7XG4gICAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICBwcmlvcml0eTogMSxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjoge25vbmU6IHt9fSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgZXhjbHVkZWRSdWxlczogW3tuYW1lOiAnU2l6ZVJlc3RyaWN0aW9uc19CT0RZJ31dXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnYXdzQ29tbW9uUnVsZXMnLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB3YWZSdWxlcy5wdXNoKGF3c01hbmFnZWRSdWxlcyk7XG5cbiAgICAgICAgLy8gQVdTIGlwIHJlcHV0YXRpb24gTGlzdFxuICAgICAgICAvL1xuICAgICAgICBsZXQgYXdzSVBSZXBMaXN0OndhZi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5ICA9IHtcbiAgICAgICAgICBuYW1lOiAnYXdzSVBSZXB1dGF0aW9uJyxcbiAgICAgICAgICBwcmlvcml0eTogMixcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjoge25vbmU6IHt9fSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0FtYXpvbklwUmVwdXRhdGlvbkxpc3QnLFxuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgZXhjbHVkZWRSdWxlczogW11cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdhd3NSZXB1dGF0aW9uJyxcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgd2FmUnVsZXMucHVzaChhd3NJUFJlcExpc3QpO1xuXG4gICAgICAgIC8vIENyZWF0ZSBXZWIgQUNMXG4gICAgICAgIGxldCB3ZWJBQ0wgPSBuZXcgd2FmLkNmbldlYkFDTCh0aGlzLCAnV2ViQUNMJywge1xuICAgICAgICAgIGRlZmF1bHRBY3Rpb246IHtcbiAgICAgICAgICAgIGFsbG93OiB7fVxuICAgICAgICAgIH0sXG4gICAgICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ3dlYkFDTCcsXG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBydWxlczogd2FmUnVsZXNcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGFwaUdhdGV3YXlBUk4gPSBgYXJuOmF3czphcGlnYXRld2F5OiR7cHJvcHMucmVnaW9ufTo6L3Jlc3RhcGlzLyR7dGhpcy5hcGlHdy5yZXN0QXBpSWR9L3N0YWdlcy8ke3RoaXMuYXBpR3cuZGVwbG95bWVudFN0YWdlLnN0YWdlTmFtZX1gXG5cbiAgICAgICAgLy8gRm9yIGV4YW1wbGU6IGFybjphd3M6YXBpZ2F0ZXdheTp1cy13ZXN0LTI6Oi9yZXN0YXBpcy9sdnIyMnNxenZhL3N0YWdlcy9kZXZcblxuICAgICAgICAvLyBBc3NvY2lhdGUgV0FGIHdpdGggZ2F0ZXdheVxuICAgICAgICAvL1xuICAgICAgICBuZXcgd2FmLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdXZWJBQ0xBc3NvY2lhdGlvbicsIHtcbiAgICAgICAgICB3ZWJBY2xBcm46IHdlYkFDTC5hdHRyQXJuLFxuICAgICAgICAgIHJlc291cmNlQXJuOiBhcGlHYXRld2F5QVJOXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyB1c2VkIHRvIGRlZmluZSBlYWNoIGxhbWJkYSBhbmQgdGhlIGFzc29jaWF0ZWQgQVBJIGdhdGV3YXkgUkVTVCB2ZXJiXG4gICAgLy8gTk9URSB0aGF0IGlmIHRoZSBsYW1iZGEgd2FudHMgdG8gdXNlIHJlbGF0aXZlIGltcG9ydHMsIGl0IHdpbGwgaGF2ZSB0byBoYXZlIGl0c1xuICAgIC8vIGNvZGUgaW5zaWRlIGEgUHl0aG9uIG1vZHVsZSBhbmQgdGhlIGhhbmRsZXIgd2lsbCBoYXZlIHRvIGJlIG1vZGlmaWVkIChzZWUgYWJvdmVcbiAgICAvLyBmb3IgZXhhbXBsZSkuXG4gICAgLy9cbiAgICBkZWZpbmVMYW1iZGFBbmRBUEkocmVzdEFwaTogYXBpLlJlc3RBcGksXG4gICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFJlc291cmNlOiBhcGkuUmVzb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgIHJlc3RSZXNvdXJjZU5hbWU6IHN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgbGFtYmRhTmFtZTogc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICBwYXRoVG9MYW1iZGE6IHN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgcHJvcHM6IElMYW1iZGFQcm9wcyxcbiAgICAgICAgICAgICAgICAgICAgICAgZG9Bbnk6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgICAgICAgIGRvUG9zdDogYm9vbGVhbixcbiAgICAgICAgICAgICAgICAgICAgICAgZG9HZXQ6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgICAgICAgIGRvUHV0OiBib29sZWFuLFxuICAgICAgICAgICAgICAgICAgICAgICBkb0RlbGV0ZTogYm9vbGVhbixcbiAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlcjogc3RyaW5nPVwibWFpbi5sYW1iZGFfaGFuZGxlclwiKSB7XG5cbiAgICAgICAgbGV0IHByZWZpeCA9IHByb3BzLnByZWZpeDtcbiAgICAgICAgbGV0IGZ1bmN0aW9uTmFtZSA9IHByZWZpeCArIFwiX1wiICsgbGFtYmRhTmFtZVxuXG4gICAgICAgIC8vIFdlIG9ubHkgZGVmaW5lIHRoZSBrZXkgdG8gZ2V0IGRiIGNyZWRlbnRpYWxzIG91dCBvZiB0aGUgc2VjcmV0c21hbmFnZXIuXG4gICAgICAgIC8vIFRoZSBrZXkgcmV0dXJucyBhbGwgZGF0YWJhc2UgY29ubmVjdGlvbiBkYXRhIG5lZWRlZCBhdCBydW50aW1lLlxuICAgICAgICAvL1xuICAgICAgICBsZXQgbGFtYmRhX2VudiA6IHtba2V5OiBzdHJpbmddOiBhbnl9PSB7XG4gICAgICAgICAgICAgICAgXCJEQl9QQVNTX0tFWVwiOiBwcm9wcy5kYlBhc3N3b3JkS2V5LFxuICAgICAgICAgICAgICAgIFwiRFlOQU1PREJfVEFCTEVcIjogcHJvcHMuZHluYW1vREIuZHluYW1vREJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgICAgICAgXCJQUkVGSVhcIjogcHJlZml4LFxuICAgICAgICAgICAgICAgIFwiSU9UX0VORFBPSU5UXCI6IHByb3BzLnN0YXRpY0lvdC5pb3RNb25pdG9yRW5kcG9pbnQsXG4gICAgICAgICAgICAgICAgXCJTVEFHRVwiOiBwcm9wcy5zdGFnZSxcbiAgICAgICAgICAgICAgICBcIklPVF9MT0dMRVZFTFwiOiBwcm9wcy5sb2dMZXZlbFxuICAgICAgICAgICAgfTtcblxuICAgICAgICBpZiAocHJvcHMudGltZXN0cmVhbSkge1xuICAgICAgICAgICAgbGFtYmRhX2VudltcIlRTX0RBVEFCQVNFXCJdID0gcHJvcHMudGltZXN0cmVhbS5kYXRhYmFzZU5hbWU7XG4gICAgICAgICAgICBsYW1iZGFfZW52W1wiVFNfVEFCTEVOQU1FXCJdID0gcHJvcHMudGltZXN0cmVhbS50YWJsZU5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgbGFtYmRhUm9sZSA9IHRoaXMuY3JlYXRlSUFNUm9sZShmdW5jdGlvbk5hbWUsIHByb3BzKTtcblxuICAgICAgICBsZXQgbGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwibGFtYmRhX1wiICsgbGFtYmRhTmFtZSwge1xuICAgICAgICAgICAgcnVudGltZTogQ29tbW9uLnB5dGhvblJ1bnRpbWVWZXJzaW9uKCksXG4gICAgICAgICAgICBoYW5kbGVyOiBoYW5kbGVyLFxuICAgICAgICAgICAgbGF5ZXJzOiBwcm9wcy5sYXllci5hbGxMYXllcnMsXG4gICAgICAgICAgICBmdW5jdGlvbk5hbWU6IGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX05BVCB9LFxuICAgICAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvcHMubGFtYmRhVGltZU91dFNlY3MpLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5zZWN1cml0eUdyb3VwLCBwcm9wcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgY29kZTogbmV3IGxhbWJkYS5Bc3NldENvZGUocGF0aFRvTGFtYmRhKSxcbiAgICAgICAgICAgIGVudmlyb25tZW50OiBsYW1iZGFfZW52XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCB0aGlzUmVzb3VyY2UgPSBwYXJlbnRSZXNvdXJjZS5hZGRSZXNvdXJjZShyZXN0UmVzb3VyY2VOYW1lKTtcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJBZGRpbmcgcmVzb3VyY2UgXCIgKyByZXN0UmVzb3VyY2VOYW1lICsgXCIgdG8gcGFyZW50OiBcIiArIHBhcmVudFJlc291cmNlLnRvU3RyaW5nKCkpXG4gICAgICAgIGxldCBsYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGkuTGFtYmRhSW50ZWdyYXRpb24obGFtYmRhRnVuY3Rpb24pO1xuXG4gICAgICAgIC8vIE5PVEU6IGFsbCB0aGVzZSBnbyB0byB0aGUgc2FtZSBmdW5jdGlvbi4gVGhlIGZ1bmN0aW9uIGNoZWNrcyB0aGUgaW5jb21pbmdcbiAgICAgICAgLy8gaHR0cCB2ZXJiIHRvIHJvdXRlIHdoYXQgaXQgc2hvdWxkIGRvLiBXZSBjb3VsZCBqdXN0IGFzIGVhc2lseSBoYXZlIHNldCB1cFxuICAgICAgICAvLyBhIHNlcGFyYXRlIGxhbWJkYSBmb3IgZWFjaCBvbmUuXG4gICAgICAgIC8vXG4gICAgICAgIGlmIChkb0FueSkge1xuICAgICAgICAgICAgdGhpc1Jlc291cmNlLmFkZFByb3h5KHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGxhbWJkYUludGVncmF0aW9uLFxuICAgICAgICAgICAgICAgIGFueU1ldGhvZDogdHJ1ZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChkb1Bvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZE1ldGhvZCh0aGlzUmVzb3VyY2UsICdQT1NUJywgbGFtYmRhSW50ZWdyYXRpb24sIHByb3BzLnVzZVNTTyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZG9QdXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZE1ldGhvZCh0aGlzUmVzb3VyY2UsICdQVVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwgcHJvcHMudXNlU1NPKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkb0dldCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkTWV0aG9kKHRoaXNSZXNvdXJjZSwgJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCBwcm9wcy51c2VTU08pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRvRGVsZXRlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRNZXRob2QodGhpc1Jlc291cmNlLCAnREVMRVRFJywgbGFtYmRhSW50ZWdyYXRpb24sIHByb3BzLnVzZVNTTyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBXZSBjYW4gb3V0cHV0IHRoZSBsYW1iZGEgbmFtZXMgYW5kIEFSTiBmb3IgbGF0ZXIgcGhhc2VzIGluIGRlcGxveW1lbnRcbiAgICAgICAgLy8gdGhleSBhcmUgc2F2ZWQgaW4gdGhlIG91dHB1dCBKU09OIGZpbGUuIEhvd2V2ZXIsIHRoZSBuYW1lcyBoYXZlIHRvIGJlIGNvbnZlcnRlZFxuICAgICAgICAvLyBmcm9tIHNuYWtlX2Nhc2UgdG8gY2FtZWxDYXNlIHRvIGxldCBDZm5PdXRwdXQgd29yay5cbiAgICAgICAgLy8gT3JkaW5hcmlseSB5b3UgZG9uJ3QgbmVlZCB0byBvdXRwdXQgdGhlc2Ugc2luY2UgdGhlIEFQSSBHYXRld2F5IGNhbGxzIHRoZW0uXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEJ1dCBpZiBhIGxhbWJkYSBuZWVkcyB0byBiZSBkaXJlY3RseSBpbnZva2VkIGZyb20gYSBzY3JpcHQgZmlsZSB2aWEgQVJOLCB0aGVuXG4gICAgICAgIC8vIGl0IG5lZWRzIHRvIGJlIHBhc3NlZCBvbiBoZXJlLlxuICAgICAgICAvL1xuICAgICAgICAvLyBsZXQgY2xlYW5OYW1lID0gQ29tbW9uLnNuYWtlVG9DYW1lbChmdW5jdGlvbk5hbWUpXG4gICAgICAgIC8vIENvbW1vbi5vdXRwdXQodGhpcywgY2xlYW5OYW1lLFxuICAgICAgICAvLyAgICAgY2xlYW5OYW1lLFxuICAgICAgICAvLyAgICAgXCJMYW1iZGEgQ3JlYXRlZCBOYW1lXCIpXG4gICAgICAgIC8vIENvbW1vbi5vdXRwdXQodGhpcywgXCJsYW1iZGFcIiArIGNsZWFuTmFtZSArIFwiQXJuXCIsXG4gICAgICAgIC8vICAgICByZXN1bHQuZnVuY3Rpb25Bcm4sXG4gICAgICAgIC8vICAgICBcIkxhbWJkYSBBUk5cIilcblxuICAgICAgICByZXR1cm4gbGFtYmRhRnVuY3Rpb247XG4gICAgfVxuXG4gICAgLy8gVXRpbGl0eSByb3V0aW5lIHRvIGFkZCBhIGxhbWJkYSBpbnRlZ3JhdGlvbiB0byBhIFJFU1QgQVBJIGZvciBhIGdpdmVuIEhUVFAgdmVyYlxuICAgIC8vIFdlJ3JlIGRvaW5nIHRoaXMgb25lIHZlcmIgYXQgYSB0aW1lIGluc3RlYWQgb2YgZm9yIGV2ZXJ5IHBvc3NpYmxlIEhUVFAgdG8gYWxsb3dcbiAgICAvLyBvdGhlciB2ZXJicyB0byBiZSB1c2VkIGZvciBvdGhlciBwdXJwb3NlcyBpbiB0aGUgZnV0dXJlLlxuICAgIC8vXG4gICAgLy8gSWYgd2UncmUgdXNpbmcgU1NPLCB0aGUgYXV0aG9yaXplciB3aWxsIGJlIHNldCB0byBJQU0uIElmIG5vdCwgd2UncmUgZ29pbmcgdG8gdXNlXG4gICAgLy8gQ29nbml0byBhdXRob3JpemF0aW9uLlxuICAgIC8vXG4gICAgYWRkTWV0aG9kKHJlc291cmNlOiBhcGkuUmVzb3VyY2UsIGh0dHBWZXJiOiBzdHJpbmcsIGludGVncmF0aW9uOiBhcGkuTGFtYmRhSW50ZWdyYXRpb24sXG4gICAgICAgICAgICAgIHVzZVNTTzogYm9vbGVhbikge1xuICAgICAgICBpZiAodXNlU1NPKSB7XG4gICAgICAgICAgICByZXNvdXJjZS5hZGRNZXRob2QoaHR0cFZlcmIsIGludGVncmF0aW9uLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLklBTVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJBZGRpbmcgTWV0aG9kOiBcIiArIGh0dHBWZXJiICsgXCIgdG8gcmVzb3VyY2U6IFwiICsgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICByZXNvdXJjZS5hZGRNZXRob2QoaHR0cFZlcmIsIGludGVncmF0aW9uLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgICAgICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGhvcml6ZXJJZDogdGhpcy5sYW1iZGFBdXRob3JpemVyLnJlZlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gRm9yIGN1c3RvbSBhdXRob3JpemVyIGFib3ZlLCB1c2UgdGhpcyBpbnN0ZWFkLlxuICAgIC8vXG4gICAgLy9hdXRob3JpemVyOiB0aGlzLmFwaUF1dGhvcml6ZXJcbiAgICAvLyBhdXRob3JpemF0aW9uVHlwZTogYXBpLkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAvLyBhdXRob3JpemVyOiB7XG4gICAgLy8gICAgIGF1dGhvcml6ZXJJZDogdGhpcy5hcGlBdXRob3JpemVyLmF1dGhvcml6ZXJJZFxuICAgIC8vIH1cblxuICAgIC8vIFRoaXMgbWV0aG9kIGlzIHVzZWQgdG8gZ28gYmFjayB0byB0aGUgbGFtYmRhcyB0aGF0IHdlIG5lZWQgYW5kIGFkZCB0aGUgSU9UIGVuZHBvaW50XG4gICAgLy8gdG8gdGhlbSBhcyBhbiBlbnZpcm9ubWVudCB2YXJpYWJsZS5cbiAgICAvL1xuICAgIHB1YmxpYyBzZXRJb3RFbmRwb2ludChpb3RFbmRwb2ludDogc3RyaW5nKSB7XG5cbiAgICB9XG59XG5cblxuLy9cbi8vIEluIGNhc2Ugd2UgbmVlZCB0byBhZGQgQ09SUyBzdXBwb3J0IHRvIHRoZSBBUElcbi8vXG4gZXhwb3J0IGZ1bmN0aW9uIGFkZENvcnNPcHRpb25zKGFwaVJlc291cmNlOiBhcGkuSVJlc291cmNlKSB7XG4gICAgIGFwaVJlc291cmNlLmFkZE1ldGhvZCgnT1BUSU9OUycsIG5ldyBhcGkuTW9ja0ludGVncmF0aW9uKHtcbiAgICAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbe1xuICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInQ29udGVudC1UeXBlLFgtQW16LURhdGUsQXV0aG9yaXphdGlvbixYLUFwaS1LZXksWC1BbXotU2VjdXJpdHktVG9rZW4sWC1BbXotVXNlci1BZ2VudCdcIixcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiBcIidmYWxzZSdcIixcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ09QVElPTlMsR0VULFBVVCxQT1NULERFTEVURSdcIixcbiAgICAgICAgICAgICB9LFxuICAgICAgICAgfV0sXG4gICAgICAgICBwYXNzdGhyb3VnaEJlaGF2aW9yOiBhcGkuUGFzc3Rocm91Z2hCZWhhdmlvci5ORVZFUixcbiAgICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogXCJ7XFxcInN0YXR1c0NvZGVcXFwiOiAyMDB9XCJcbiAgICAgICAgIH0sXG4gICAgIH0pLCB7XG4gICAgICAgICBtZXRob2RSZXNwb25zZXM6IFt7XG4gICAgICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgICAgIH0sXG4gICAgICAgICB9XVxuICAgICB9KVxuIH1cblxuXG4iXX0=