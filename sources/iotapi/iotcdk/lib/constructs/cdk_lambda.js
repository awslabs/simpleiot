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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2xhbWJkYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNka19sYW1iZGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7Ozs7RUFJRTtBQUNGLG1DQUFtQztBQUVuQyxrREFBa0Q7QUFDbEQsaURBQWlEO0FBQ2pELDJDQUEyQztBQUUzQywyQ0FBMkM7QUFDM0MsNkNBQThDO0FBRTlDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBRSxNQUFNLENBQUUsQ0FBQTtBQUM5QixxQ0FBaUM7QUFDakMsOENBQStDO0FBQy9DLCtEQUFnSDtBQThCL0csQ0FBQztBQUdGLE1BQWEsU0FBVSxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBNEMxQyxZQUFZLEtBQWdCLEVBQ2hCLEVBQVUsRUFBRSxLQUFtQjtRQUV2QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLGVBQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUVoQyw0REFBNEQ7UUFDNUQsNEVBQTRFO1FBQzVFLElBQUk7UUFDSixtRUFBbUU7UUFDbkUsbUNBQW1DO1FBQ25DLHdCQUF3QjtRQUN4Qix5Q0FBeUM7UUFDekMsNEJBQTRCO1FBQzVCLDRDQUE0QztRQUM1QyxpQ0FBaUM7UUFDakMsMkNBQTJDO1FBQzNDLHlCQUF5QjtRQUN6Qix1Q0FBdUM7UUFDdkMsc0JBQXNCO1FBQ3RCLDRDQUE0QztRQUM1QyxpQ0FBaUM7UUFDakMsaURBQWlEO1FBQ2pELGtEQUFrRDtRQUNsRCw4Q0FBOEM7UUFDOUMseUJBQXlCO1FBQ3pCLHdEQUF3RDtRQUN4RCxxQkFBcUI7UUFDckIsZ0JBQWdCO1FBQ2hCLGFBQWE7UUFDYixRQUFRO1FBQ1IsTUFBTTtRQUVOLDhGQUE4RjtRQUM5RixnR0FBZ0c7UUFDaEcsOERBQThEO1FBQzlELGdHQUFnRztRQUNoRyxtR0FBbUc7UUFDbkcsK0RBQStEO1FBQy9ELGtHQUFrRztRQUNsRyxvQkFBb0I7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RCxFQUFFLFNBQVM7b0JBQ3BFLHFEQUFxRCxFQUFFLCtCQUErQjtpQkFDekY7YUFDSixDQUFDO1FBQ0YsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUs7UUFDbEQsZ0JBQWdCLEVBQUU7WUFDZCxrQkFBa0IsRUFBRSx1QkFBdUI7U0FDOUM7S0FDSixDQUFDLEVBQUU7UUFDQSxlQUFlLEVBQUUsQ0FBQztnQkFDZCxVQUFVLEVBQUUsS0FBSztnQkFDakIsa0JBQWtCLEVBQUU7b0JBQ2hCLHFEQUFxRCxFQUFFLElBQUk7b0JBQzNELHFEQUFxRCxFQUFFLElBQUk7b0JBQzNELHlEQUF5RCxFQUFFLElBQUk7b0JBQy9ELG9EQUFvRCxFQUFFLElBQUk7aUJBQzdEO2FBQ0osQ0FBQztLQUNMLENBQUMsQ0FBQTtBQUNOLENBQUM7QUExQkQsd0NBMEJDIiwic291cmNlc0NvbnRlbnQiOlsiLyogwqkgMjAyMiBBbWF6b24gV2ViIFNlcnZpY2VzLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFNpbXBsZUlPVCBwcm9qZWN0LlxuICogQXV0aG9yOiBSYW1pbiBGaXJvb3p5ZSAoZnJhbWluQGFtYXpvbi5jb20pXG4qL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IGFwaSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JylcbmltcG9ydCBsYW1iZGEgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJylcbmltcG9ydCBpYW0gPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtaWFtJylcbmltcG9ydCBlYzIgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtZWMyJylcbmltcG9ydCBpb3QgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtaW90JylcbmltcG9ydCB3YWYgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3Mtd2FmdjInKTtcbmltcG9ydCB7Q29kZX0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIlxuY29uc3QgcGF0aCA9IHJlcXVpcmUoIFwicGF0aFwiIClcbmltcG9ydCB7IENvbW1vbiB9IGZyb20gJy4vY29tbW9uJ1xuaW1wb3J0IHtNYW5hZ2VkUG9saWN5fSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiO1xuaW1wb3J0IHsgTGFtYmRhUmVzdEFwaSwgQ2ZuQXV0aG9yaXplciwgTGFtYmRhSW50ZWdyYXRpb24sIEF1dGhvcml6YXRpb25UeXBlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0IHtDREtTdGF0aWNJT1R9IGZyb20gXCIuL2Nka19zdGF0aWNpb3RcIjtcbmltcG9ydCB7Q0RLTGFtYmRhTGF5ZXJ9IGZyb20gXCIuL2Nka19sYW1iZGFsYXllclwiO1xuaW1wb3J0IHtDREtUaW1lc3RyZWFtfSBmcm9tIFwiLi9jZGtfdGltZXN0cmVhbVwiO1xuaW1wb3J0IHtDZm5Ub3BpY1J1bGV9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaW90XCI7XG5pbXBvcnQgTGFtYmRhQWN0aW9uUHJvcGVydHkgPSBDZm5Ub3BpY1J1bGUuTGFtYmRhQWN0aW9uUHJvcGVydHk7XG5pbXBvcnQge0NES0R5bmFtb0RCfSBmcm9tIFwiLi9jZGtfZHluYW1vZGJcIjtcblxuXG5pbnRlcmZhY2UgSUxhbWJkYVByb3BzIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrUHJvcHMge1xuICAgIHByZWZpeDogc3RyaW5nLFxuICAgIHN0YWdlOiBzdHJpbmcsXG4gICAgdXVpZDogc3RyaW5nLFxuICAgIGxvZ0xldmVsOiBzdHJpbmcsXG4gICAgZGJQYXNzd29yZEtleTogc3RyaW5nLFxuICAgIGR5bmFtb0RCOiBDREtEeW5hbW9EQixcbiAgICBodHRwc1BvcnQ6IG51bWJlcixcbiAgICBsYXllcjogQ0RLTGFtYmRhTGF5ZXIsXG4gICAgbGFtYmRhVGltZU91dFNlY3M6IG51bWJlcixcbiAgICByZWdpb246IHN0cmluZyxcbiAgICBnYXRld2F5UmVwdWJsaXNoVG9waWNzOiBzdHJpbmcsXG4gICAgc2VjdXJpdHlHcm91cDogZWMyLklTZWN1cml0eUdyb3VwLFxuICAgIGRiU2VjdXJpdHlHcm91cDogZWMyLklTZWN1cml0eUdyb3VwLFxuICAgIGNvZ25pdG9Vc2VycG9vbEFybjogc3RyaW5nLFxuICAgIHN0YXRpY0lvdDogQ0RLU3RhdGljSU9ULFxuICAgIHRpbWVzdHJlYW0/OiBDREtUaW1lc3RyZWFtLFxuICAgIHZwYzogZWMyLklWcGMsXG4gICAgdXNlU1NPOiBib29sZWFuLFxuICAgIHNhbWxNZXRhZGF0YUZpbGVQYXRoOiBzdHJpbmcsXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59O1xuXG5cbmV4cG9ydCBjbGFzcyBDREtMYW1iZGEgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuXG4gICAgcHJpdmF0ZSBsb2NhbEd3R0dSb2xlOiBpYW0uUm9sZTtcbiAgICBwdWJsaWMgYXBpTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIGFwaUd3OiBhcGkuUmVzdEFwaTtcbiAgICBwcml2YXRlIGxhbWJkYUF1dGhvcml6ZXI6IENmbkF1dGhvcml6ZXI7XG4gICAgcHVibGljIGdnR3dMYW1iZGE6IGxhbWJkYS5GdW5jdGlvblxuICAgIHB1YmxpYyBzc29BUElHYXRld2F5SW52b2tlUm9sZTogaWFtLlJvbGU7XG5cbiAgICAvLyBUaGVzZSBhcmUgbGFtYmRhcyBjcmVhdGVkIHRvIGhhbmRsZSBhbGwgdGhlIEFQSSBjYWxscy4gV2Ugc2F2ZSB0aGVtIHNvXG4gICAgLy8gdGhpbmdzIGxpa2UgSU9UIHJ1bGVzIGNhbiByZWZlcmVuY2UgdGhlbS5cbiAgICAvL1xuICAgIHB1YmxpYyBwcm9qZWN0TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIG1vZGVsTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIGRldmljZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBkYXRhVHlwZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBkYXRhTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVzZXJMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgbG9jYXRpb25MYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcblxuICAgIHB1YmxpYyBhZG1pbkxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmZWF0dXJlTWFuYWdlckxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmaXJtd2FyZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBzZXR0aW5nTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHRlbXBsYXRlTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVwZGF0ZUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gICAgcHVibGljIHVpQWRtaW5MYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgdWlBdXRoTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpRGF0YUxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyB1aURhdGFUeXBlTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpRGV2aWNlTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpTW9kZWxMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgdWlQcm9qZWN0TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIHVpU3RhcnRMYW1iZGE6IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgdWlVc2VyTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgICBwdWJsaWMgZmVhdHVyZUFsZXhhTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIGZlYXR1cmVDb25uZWN0TGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIGZlYXR1cmVHcmFmYW5hTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG4gICAgcHVibGljIGZlYXR1cmVMb2NhdGlvbkxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmZWF0dXJlVHdpbkxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xuICAgIHB1YmxpYyBmZWF0dXJlU21zTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LFxuICAgICAgICAgICAgICAgIGlkOiBzdHJpbmcsIHByb3BzOiBJTGFtYmRhUHJvcHMpXG4gICAgICAgIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICAgICAgQ29tbW9uLmFkZFRhZ3ModGhpcywgcHJvcHMudGFncylcblxuICAgICAgICAvLyBsZXQgbG9jYWxHd0dHUm9sZU5hbWUgPSBuYW1lUHJlZml4ICsgXCJfZ3dfZ2dfbG9jYWxfcm9sZVwiO1xuICAgICAgICAvLyB0aGlzLmxvY2FsR3dHR1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgbmFtZVByZWZpeCArIFwiX2d3X2dnX2xvY2FsX3JvbGVcIixcbiAgICAgICAgLy8ge1xuICAgICAgICAvLyAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgICAgLy8gICAgIHJvbGVOYW1lOiBsb2NhbEd3R0dSb2xlTmFtZSxcbiAgICAgICAgLy8gICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIC8vICAgICAgICAgXCJHR1wiOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgLy8gICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAvLyAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAvLyAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgXCJzdHM6QXNzdW1lUm9sZVwiXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgLy8gICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAvLyAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAvLyAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgXCJsb2dzOkNyZWF0ZUxvZ0dyb3VwXCIsXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dTdHJlYW1cIixcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgXCJsb2dzOlB1dExvZ0V2ZW50c1wiXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcImFybjphd3M6bG9nczoqOio6KlwiXVxuICAgICAgICAvLyAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgLy8gICAgICAgICAgICAgXVxuICAgICAgICAvLyAgICAgICAgIH0pXG4gICAgICAgIC8vICAgICB9XG4gICAgICAgIC8vIH0pO1xuXG4gICAgICAgIC8vIFRoZXJlIGFyZSB0aHJlZSBraW5kcyBvZiBsYW1iZGFzLiBUaGUgb25lcyBjYWxsZWQgYnkgdGhlIGRhc2hib2FyZCwgdGhlIG9uZXMgaW52b2tlZCBieSB0aGVcbiAgICAgICAgLy8gSU9UIG9uY2UgZGF0YSBjb21lcyBpbiBmcm9tIGVhY2ggZGV2aWNlICh0aGlzIGluY2x1ZGVzIHRoZSBvbmUgaW52b2tlZCBieSB0aGUgU1FTIHByb2Nlc3NvciksXG4gICAgICAgIC8vIGFuZCB0aGUgb25lcyBjYWxsZWQgYnkgR3JlZW5ncmFzcyBhbmQgcHVzaGVkIG9udG8gYSBkZXZpY2UuXG4gICAgICAgIC8vIFNvbWUgb2YgdGhlc2UgbmVlZCBhY2Nlc3MgdG8gdGhlIGRhdGFiYXNlLiBBbGwgZGF0YWJhc2UgbWV0aG9kcyBhcmUgc3RvcmVkIGluIHR3byBsYXllcnMgdGhhdFxuICAgICAgICAvLyBjb250YWlucyB0aGUgY29kZSBmb3IgYWNjZXNzaW5nIHRoZSBkYXRhYmFzZS4gT25lIGxheWVyIGNvbnRhaW5zIHB5dGhvbiBEQiBkcml2ZXJzIGFuZCB0aGUgb3RoZXJcbiAgICAgICAgLy8gdGhlIGNvbW1vbiBjb2RlIHRoYXQgYWxsIGxhbWJkYXMgdXNlIHRvIGFjY2VzcyB0aGUgZGF0YWJhc2UuXG4gICAgICAgIC8vIFRob3NlIGxheWVycyBhcmUgc3RvcmVkIHVuZGVyIGxhbWJkYV9zcmMvbGF5ZXJzLy4uLiBhbmQgYXJlIHppcCBhcmNoaXZlZCBpbiB0aGUgZm9ybWF0IGV4cGVjdGVkXG4gICAgICAgIC8vIGJ5IGxhbWJkYSBsYXllcnMuXG4gICAgICAgIC8vXG5cbiAgICAgICAgLy8gTm93IGxldCdzIGNyZWF0ZSB0aGUgQVBJIGdhdGV3YXkgZm9yIHRoZSBjYWxscyB0aGF0IG5lZWQgYWNjZXNzIGZyb20gZGFzaGJvYXJkIGFuZCBtb2JpbGVcbiAgICAgICAgLy8gYWNjZXNzLlxuICAgICAgICAvL1xuICAgICAgICBsZXQgcmVzdEFwaU5hbWUgPSBwcm9wcy5wcmVmaXggKyBcIl9yZXN0X2FwaVwiO1xuXG4gICAgICAgIC8vIE5PVEU6IHdlIGNyZWF0ZSBkaWZmZXJlbnQgQVBJcyBmb3IgZWFjaCBzdGFnZSB0byBtYWludGFpbiBpc29sYXRpb24uXG4gICAgICAgIC8vIEZvciB1c2VyLWZyaWVuZGxpbmVzcywgd2UgYWxzbyBkZXBsb3kgZWFjaCBzdGFnZSB3aXRoIHRoZSBzdGFnZSBuYW1lLlxuICAgICAgICAvLyBGb3IgZXhhbXBsZSwgZm9yIHRoZSAnZGV2JyBzdGFnZSwgdGhlIG5hbWUgb2YgdGhlIGFwaSB3aWxsIGJlIFwiIyMjX2Rldl9yZXN0X2FwaVwiXG4gICAgICAgIC8vIGFuZCBpdCB3aWxsIGJlIGRlcGxveWVkIHdpdGggdGhlICdkZXYnIHN0YWdlLCBzbyB0aGUgZW5kcG9pbnQgQVBJIGZvciBpdCB3aWxsXG4gICAgICAgIC8vIGVuZCB1cCBiZWluZyAnaHR0cHM6Ly8uLi4uLi4vZGV2Jy5cbiAgICAgICAgLy8gVGhpcyBtYWtlcyBpdCBlYXNpZXIgdG8gdGVsbCB0aGVtIGFwYXJ0IGR1cmluZyB0ZXN0aW5nLiBIb3dldmVyLCBpdCBtZWFuc1xuICAgICAgICAvLyBpZiB1c2luZyB0b29scyBsaWtlIFBvc3RtYW4sIHlvdSdsbCB3YW50IHRvIG5vdCBvbmx5IHBvaW50IGl0IGF0IHRoZSByaWdodFxuICAgICAgICAvLyBBUEkgVVJMLCBidXQgYWxzbyBnZXQgdGhlIHN0YWdlIG5hbWUgaW4gdGhlcmUgY29ycmVjdGx5LlxuICAgICAgICAvL1xuICAgICAgICB0aGlzLmFwaUd3ID0gbmV3IGFwaS5SZXN0QXBpKHRoaXMsIGlkICsgXCJfcmVzdF9hcGlcIiwge1xuICAgICAgICAgICAgcmVzdEFwaU5hbWU6IHJlc3RBcGlOYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiQVBJIGZvciBcIiArIHByb3BzLnN0YWdlICsgXCIgc3RhZ2VcIixcbiAgICAgICAgICAgIGVuZHBvaW50VHlwZXM6IFsgYXBpLkVuZHBvaW50VHlwZS5SRUdJT05BTCBdLFxuICAgICAgICAgICAgZGVwbG95OiB0cnVlLFxuICAgICAgICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICAgICAgICAgIHN0YWdlTmFtZTogcHJvcHMuc3RhZ2UsXG4gICAgICAgICAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICAgICAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogZmFsc2UgLy8gTk9URTogc2V0dGluZyB0aGlzIHRvIHRydWUgb24gaW50ZXJuYWwgc2FuZGJveCBzeXN0ZW1zIHdpbGwgZmxhZyBhIFNFVkVSRSBlcnJvci5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICBhbGxvd09yaWdpbnM6IGFwaS5Db3JzLkFMTF9PUklHSU5TXG4gICAgICAgICAgICAgICAgLy8gYWxsb3dNZXRob2RzOiBbXCJHRVRcIiwgXCJQT1NUXCIsIFwiUFVUXCIsIFwiREVMRVRFXCIsIFwiT1BUSU9OU1wiXVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVW5jb21tZW50IHRoZSBmb2xsb3dpbmcgaWYgeW91IHdhbnQgdG8gYXNzaWduIGEgY3VzdG9tIGRvbWFpblxuICAgICAgICAgICAgLy8gdG8gdGhlIEFQSVxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vICwgZG9tYWluTmFtZToge1xuICAgICAgICAgICAgLy8gICAgIGRvbWFpbk5hbWU6IFwiYXBpLm15ZG9tYWluLmNvbVwiLFxuICAgICAgICAgICAgLy8gICAgIGNlcnRpZmljYXRlOiBhY21DZXJ0aWZpY2F0ZUZvckFQSURvbWFpblxuICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgLy9cbiAgICAgICAgIH0pO1xuXG4gICAgICAgIC8vIExldCdzIGFkZCB0aGUgV0FGIHRvIHRoZSBBUEkgZ2F0ZXdheSBmb3IgYmV0dGVyIHNlY3VyaXR5XG4gICAgICAgIC8vXG4gICAgICAgIHRoaXMuYWRkV0FGVG9BUElHYXRld2F5KHByb3BzKTtcblxuICAgICAgICAvLyBJZiB1c2luZyBTU08sIHdlIGRvbid0IG5lZWQgbGFtYmRhIGF1dGhvcml6ZXJzIGFuZCBjb2duaXRvIHVzZXIgcG9vbHMuXG4gICAgICAgIC8vIEluc3RlYWQsIHdlJ2xsIGJlIHVzaW5nIElBTS4gSWYgdXNpbmcgU1NPLCBob3dldmVyLCB3ZSBuZWVkIHRvIGNyZWF0ZVxuICAgICAgICAvLyBhbiBTU08gcm9sZSB0aGF0IGFsbG93cyBhY2Nlc3MgdG8gdGhlIEFQSSBnYXRld2F5LiBGb3IgZGV2ZWxvcG1lbnQgd2UncmVcbiAgICAgICAgLy8ga2VlcGluZyBpdCBvcGVuLiBCdXQgZm9yIHByb2R1Y3Rpb24gaXQgc2hvdWxkIGJlIGxpbWl0ZWQgc28gb25seSBhY2Nlc3MgZnJvbVxuICAgICAgICAvLyB0aGUgZGFzaGJvYXJkIGlzIGFsbG93ZWQuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEZvciB0aGlzIHRvIHdvcmssIHdlIG5lZWQgdGhlIHBhdGggdG8gdGhlIHNhbWwtbWV0YWRhdGEtZG9jdW1lbnQueG1sIGZpbGUuXG4gICAgICAgIC8vIFRoZSBpbnN0YWxsZXIgYXNrcyBmb3IgdGhpcyBhbmQgc3RvcmVzIGl0IGluIHRoZSBib290c3RyYXAgZmlsZS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gTW9yZSBpbmZvIGhlcmU6IGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL2xhdGVzdC9kb2NzL2F3cy1pYW0tcmVhZG1lLmh0bWxcbiAgICAgICAgLy9cbiAgICAgICAgaWYgKHByb3BzLnVzZVNTTykge1xuICAgICAgICAgICAgbGV0IHNzb1JvbGVOYW1lID0gXCJzaW1wbGVpb3Rfc3NvX2FwaV9pbnZva2Vfcm9sZVwiXG5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgY29tbWVudGVkIGZvciBub3cgdW50aWwgaXQgY2FuIGJlIGZ1cnRoZXIgdGVzdGVkIHdpdGggZGlmZmVyZW50IFNBTUwgSURQIHByb3ZpZGVycy5cbiAgICAgICAgICAgIC8vIEZvciBub3csIHRvIG1ha2UgdGhpcyB3b3JrLCBzZXQgdXAgeW91ciBBV1MgU1NPIGFuZCBpbiBJQU0gY3JlYXRlIGEgUm9sZSB3aXRoIFNBTUwgMi4wLiBDaG9vc2VcbiAgICAgICAgICAgIC8vIFwiQm90aCBDb25zb2xlIGFuZCBQcm9ncmFtbWF0aWMgQWNjZXNzXCIgdGhlbiBhZGQgYW4gQW1hem9uQVBJR2F0ZXdheUludm9rZUZ1bGxBY2Nlc3MgcG9saWN5IHRvIGl0LlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIGNvbnN0IHByb3ZpZGVyID0gbmV3IGlhbS5TYW1sUHJvdmlkZXIodGhpcywgJ1NTT19TQU1MX1Byb3ZpZGVyJywge1xuICAgICAgICAgICAgLy8gICAgIG1ldGFkYXRhRG9jdW1lbnQ6IGlhbS5TYW1sTWV0YWRhdGFEb2N1bWVudC5mcm9tRmlsZShwcm9wcy5zYW1sTWV0YWRhdGFGaWxlUGF0aCksXG4gICAgICAgICAgICAvLyB9KTtcbiAgICAgICAgICAgIC8vIHRoaXMuc3NvQVBJR2F0ZXdheUludm9rZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgaWQgKyBcInNzb19zYW1sX3JvbGVcIiwge1xuICAgICAgICAgICAgLy8gICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TYW1sQ29uc29sZVByaW5jaXBhbChwcm92aWRlciksXG4gICAgICAgICAgICAvLyAgICAgcm9sZU5hbWU6IHNzb1JvbGVOYW1lLFxuICAgICAgICAgICAgLy8gICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgLy8gICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBbWF6b25BUElHYXRld2F5SW52b2tlRnVsbEFjY2Vzc1wiKVxuICAgICAgICAgICAgLy8gICAgICAgICBdXG4gICAgICAgICAgICAvLyAgICAgfVxuICAgICAgICAgICAgLy8gKTtcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQVBJIEF1dGhvcml6ZXIgdGhhdCB1c2VzIENvZ25pdG8gVXNlciBwb29sIHRvIEF1dGhvcml6ZSB1c2Vycy5cbiAgICAgICAgICAgIGxldCBhdXRob3JpemVyTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2NvZ25pdG9fYXV0aG9yaXplclwiXG4gICAgICAgICAgICB0aGlzLmxhbWJkYUF1dGhvcml6ZXIgPSBuZXcgQ2ZuQXV0aG9yaXplcih0aGlzLCBpZCArIFwiX2NvZ25pdG9fYXV0aG9yaXplclwiLCB7XG4gICAgICAgICAgICAgICAgcmVzdEFwaUlkOiB0aGlzLmFwaUd3LnJlc3RBcGlJZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBhdXRob3JpemVyTmFtZSxcbiAgICAgICAgICAgICAgICB0eXBlOiAnQ09HTklUT19VU0VSX1BPT0xTJyxcbiAgICAgICAgICAgICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAgICAgICBwcm92aWRlckFybnM6IFtwcm9wcy5jb2duaXRvVXNlcnBvb2xBcm5dLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoaXMgYXV0aG9yaXplciBpcyBhbiBleGFtcGxlIGZvciBjcmVhdGluZyBvbmUgYW5kIHZhbGlkYXRpbmcgaXQgdXNpbmcgYSBsYW1iZGEuXG4gICAgICAgIC8vIFdlJ3JlIG5vdCB1c2luZyBpdCBoZXJlLCBidXQgaXQncyBoZXJlIGlmIHNvbWVvbmUgd2FudHMgdG8gdXNlIHRoZWlyIG93blxuICAgICAgICAvLyB1c2VyIGF1dGhvcml6YXRpb24gc3lzdGVtIGluc3RlYWQgb2YgQ29nbml0by5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gbGV0IGFwaUF1dGhvcml6ZXJOYW1lID0gbmFtZVByZWZpeCArIFwiX2F1dGhfYXV0aG9yaXplclwiO1xuICAgICAgICAvLyB0aGlzLmFwaUF1dGhvcml6ZXIgPSBuZXcgYXBpLlJlcXVlc3RBdXRob3JpemVyKHRoaXMsIGFwaUF1dGhvcml6ZXJOYW1lLCB7XG4gICAgICAgIC8vICAgICBoYW5kbGVyOiB0aGlzLmFwaUF1dGhvcml6ZXJMYW1iZGEsXG4gICAgICAgIC8vICAgICBpZGVudGl0eVNvdXJjZXM6IFthcGkuSWRlbnRpdHlTb3VyY2UuaGVhZGVyKCdBdXRob3JpemF0aW9uJyldXG4gICAgICAgIC8vIH0pXG5cbiAgICAgICAgLy8gVGhlc2UgYXJlIHByb3BlcnRpZXMgZm9yIHBhc3NpbmcgZG93biB0byBlYWNoIGZ1bmN0aW9uLlxuICAgICAgICAvL1xuXG4gICAgICAgLy8gdGhpcy5yb2xlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAvLyAgICAgXCJyb2xlXCIsXG4gICAgICAgLy8gICAgIFwiYXBpX3JvbGVcIixcbiAgICAgICAvLyAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV9yb2xlXCIsXG4gICAgICAgLy8gICAgIGxhbWJkYVBhcmFtcywgZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgLy8gV2UgY3JlYXRlIGEgbWFwIHdpdGggdGhlIG5hbWUgb2YgQVBJIHByZWZpeGVzIGFuZCB0aGUgYWN0dWFsIHJlc291cmNlcyBpbiB0aGVtLlxuICAgICAgIC8vIExhdGVyIG9uLCB3ZSBsb29rdXAgZWFjaCBwYXJlbnQgcmVzb3VyY2UgaW4gdGhpcyB0YWJsZSBzbyB3ZSBrbm93IHdoZXJlIHRvXG4gICAgICAgLy8gYXR0YWNoIGVhY2ggUkVTVCBBUEkgcGF0aCB0by4gRm9yIGV4YW1wbGUsIGlmIGRlZmluaXRpbmcgXCIvdWkvdXNlclwiLCB3ZVxuICAgICAgIC8vIHdvdWxkIGFkZCBcInVzZXJcIiB0byB0aGUgXCJ1aVwiIHJlc291cmNlIHdoaWNoIGlzIGFscmVhZHkgZGVmaW5lZCB1bmRlciB0aGUgcm9vdC5cblxuICAgICAgIGxldCBhcGlSb290ID0gdGhpcy5hcGlHdy5yb290LmFkZFJlc291cmNlKCd2MScpO1xuICAgICAgIGxldCB1aVJlc291cmNlID0gYXBpUm9vdC5hZGRSZXNvdXJjZShcInVpXCIpXG4gICAgICAgbGV0IGZlYXR1cmVSZXNvdXJjZSA9IGFwaVJvb3QuYWRkUmVzb3VyY2UoXCJmZWF0dXJlXCIpXG5cbiAgICAgICB0aGlzLnByb2plY3RMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcInByb2plY3RcIixcbiAgICAgICAgICAgXCJhcGlfcHJvamVjdFwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX3Byb2plY3RcIixcbiAgICAgICAgICAgcHJvcHMsIGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMubW9kZWxMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcIm1vZGVsXCIsXG4gICAgICAgICAgIFwiYXBpX21vZGVsXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfbW9kZWxcIixcbiAgICAgICAgICAgcHJvcHMsIGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuZGF0YVR5cGVMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcImRhdGF0eXBlXCIsXG4gICAgICAgICAgIFwiYXBpX2RhdGF0eXBlXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfZGF0YXR5cGVcIixcbiAgICAgICAgICAgcHJvcHMsIGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuZGF0YUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgIFwiZGF0YVwiLFxuICAgICAgICAgICBcImFwaV9kYXRhXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfZGF0YVwiLFxuICAgICAgICAgICBwcm9wcywgZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgIC8vIEFsbG93IHRoZSBkYXRhIHNldCBBUEkgdG8gcmVhZC93cml0ZSB0byB0aGUgZHluYW1vZGIgdGFibGVcbiAgICAgICAgLy9cbiAgICAgICAgcHJvcHMuZHluYW1vREIuZHluYW1vREJUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5kYXRhTGFtYmRhKTtcblxuICAgICAgIHRoaXMuZGV2aWNlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJkZXZpY2VcIixcbiAgICAgICAgICAgXCJhcGlfZGV2aWNlXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfZGV2aWNlXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuYWRtaW5MYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcImFkbWluXCIsXG4gICAgICAgICAgIFwiYXBpX2FkbWluXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfYWRtaW5cIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy5mZWF0dXJlTWFuYWdlckxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgIFwiZmVhdHVyZW1hbmFnZXJcIixcbiAgICAgICAgICAgXCJhcGlfZmVhdHVyZW1hbmFnZXJcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV9mZWF0dXJlbWFuYWdlclwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmZpcm13YXJlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJmaXJtd2FyZVwiLFxuICAgICAgICAgICBcImFwaV9maXJtd2FyZVwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX2Zpcm13YXJlXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuc2V0dGluZ0xhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGFwaVJvb3QsXG4gICAgICAgICAgIFwic2V0dGluZ1wiLFxuICAgICAgICAgICBcImFwaV9zZXR0aW5nXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfc2V0dGluZ1wiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCB1c2luZyBTU08sIHRoZW4gd2Ugd2FudCB0byBkZWZpbmUgdXNlci1tYW5hZ2VtZW50IEFQSXNcbiAgICAgICAgIC8vIHRoYXQgYWN0IGFzIGZyb250IGZvciBDb2duaXRvIHVzZXIgcG9vbHMuIEV2ZW50dWFsbHksIHdlJ2xsIG5lZWQgcm9sZSBzdXBwb3J0XG4gICAgICAgICAvLyBhcyB3ZWxsLlxuICAgICAgICAgLy9cbiAgICAgICAgaWYgKCFwcm9wcy51c2VTU08pIHtcbiAgICAgICAgICAgIHRoaXMudXNlckxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgICAgICBcInVzZXJcIixcbiAgICAgICAgICAgICAgICBcImFwaV91c2VyXCIsXG4gICAgICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX3VzZXJcIixcbiAgICAgICAgICAgICAgICBwcm9wcywgZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICB0aGlzLmxvY2F0aW9uTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgYXBpUm9vdCxcbiAgICAgICAgICAgXCJsb2NhdGlvblwiLFxuICAgICAgICAgICBcImFwaV9sb2NhdGlvblwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfYXBpX2xvY2F0aW9uXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudGVtcGxhdGVMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcInRlbXBsYXRlXCIsXG4gICAgICAgICAgIFwiYXBpX3RlbXBsYXRlXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2lvdF9hcGlfdGVtcGxhdGVcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy51cGRhdGVMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBhcGlSb290LFxuICAgICAgICAgICBcInVwZGF0ZVwiLFxuICAgICAgICAgICBcImFwaV91cGRhdGVcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvaW90X2FwaV91cGRhdGVcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy51aUFkbWluTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgdWlSZXNvdXJjZSxcbiAgICAgICAgICAgXCJhZG1pblwiLFxuICAgICAgICAgICBcInVpX2FwaV9hZG1pblwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS91aS9pb3RfdWlfYXBpX2FkbWluXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudWlBdXRoTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgdWlSZXNvdXJjZSxcbiAgICAgICAgICAgXCJhdXRoXCIsXG4gICAgICAgICAgIFwidWlfYXBpX2F1dGhcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvdWkvaW90X3VpX2FwaV9hdXRoXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudWlEYXRhTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgdWlSZXNvdXJjZSxcbiAgICAgICAgICAgXCJkYXRhXCIsXG4gICAgICAgICAgIFwidWlfYXBpX2RhdGFcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvdWkvaW90X3VpX2FwaV9kYXRhXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudWlEYXRhVHlwZUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwiZGF0YXR5cGVcIixcbiAgICAgICAgICAgXCJ1aV9hcGlfZGF0YXR5cGVcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvdWkvaW90X3VpX2FwaV9kYXRhdHlwZVwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpRGV2aWNlTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgdWlSZXNvdXJjZSxcbiAgICAgICAgICAgXCJkZXZpY2VcIixcbiAgICAgICAgICAgXCJ1aV9hcGlfZGV2aWNlXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfZGV2aWNlXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMudWlNb2RlbExhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwibW9kZWxcIixcbiAgICAgICAgICAgXCJ1aV9hcGlfbW9kZWxcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvdWkvaW90X3VpX2FwaV9tb2RlbFwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpUHJvamVjdExhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIHVpUmVzb3VyY2UsXG4gICAgICAgICAgIFwicHJvamVjdFwiLFxuICAgICAgICAgICBcInVpX2FwaV9wcm9qZWN0XCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfcHJvamVjdFwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLnVpU3RhcnRMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICB1aVJlc291cmNlLFxuICAgICAgICAgICBcInN0YXJ0XCIsXG4gICAgICAgICAgIFwidWlfYXBpX3N0YXJ0XCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL3VpL2lvdF91aV9hcGlfc3RhcnRcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy51aVVzZXJMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICB1aVJlc291cmNlLFxuICAgICAgICAgICBcInVzZXJcIixcbiAgICAgICAgICAgXCJ1aV9hcGlfdXNlclwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS91aS9pb3RfdWlfYXBpX3VzZXJcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgLy8gVGhlc2UgYXJlIGFsbCBvcHRpb25hbC4gV2UncmUgZGVmaW5pbmcgaXQgaGVyZSwgYnV0IGl0IHJlYWxseSBzaG91bGQgYmUgbW92ZWRcbiAgICAgICAvLyB0byBhIG1vcmUgZHluYW1pYyBmZWF0dXJlIG1hbmFnZXIgc28gd2UgY2FuIGFjdGl2YXRlL2FkZC9yZW1vdmUgdGhlbSBsaWtlIHBsdWdpbnMuXG4gICAgICAgLy9cbiAgICAgICB0aGlzLmZlYXR1cmVBbGV4YUxhbWJkYSA9IHRoaXMuZGVmaW5lTGFtYmRhQW5kQVBJKHRoaXMuYXBpR3csXG4gICAgICAgICAgIGZlYXR1cmVSZXNvdXJjZSxcbiAgICAgICAgICAgXCJhbGV4YVwiLFxuICAgICAgICAgICBcImZlYXR1cmVfYXBpX2FsZXhhXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2ZlYXR1cmUvaW90X2ZlYXR1cmVfYXBpX2FsZXhhXCIsXG4gICAgICAgICAgIHByb3BzLGZhbHNlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuICAgICAgIHRoaXMuZmVhdHVyZUNvbm5lY3RMYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBmZWF0dXJlUmVzb3VyY2UsXG4gICAgICAgICAgIFwiY29ubmVjdFwiLFxuICAgICAgICAgICBcImZlYXR1cmVfYXBpX2Nvbm5lY3RcIixcbiAgICAgICAgICAgIFwiLi9saWIvbGFtYmRhX3NyYy9hcGkvZmVhdHVyZS9pb3RfZmVhdHVyZV9hcGlfY29ubmVjdFwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmZlYXR1cmVHcmFmYW5hTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgZmVhdHVyZVJlc291cmNlLFxuICAgICAgICAgICBcImdyYWZhbmFcIixcbiAgICAgICAgICAgXCJmZWF0dXJlX2FwaV9ncmFmYW5hXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2ZlYXR1cmUvaW90X2ZlYXR1cmVfYXBpX2Nvbm5lY3RcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy5mZWF0dXJlTG9jYXRpb25MYW1iZGEgPSB0aGlzLmRlZmluZUxhbWJkYUFuZEFQSSh0aGlzLmFwaUd3LFxuICAgICAgICAgICBmZWF0dXJlUmVzb3VyY2UsXG4gICAgICAgICAgIFwibG9jYXRpb25cIixcbiAgICAgICAgICAgXCJmZWF0dXJlX2FwaV9sb2NhdGlvblwiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9mZWF0dXJlL2lvdF9mZWF0dXJlX2FwaV9sb2NhdGlvblwiLFxuICAgICAgICAgICBwcm9wcyxmYWxzZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgICAgICB0aGlzLmZlYXR1cmVUd2luTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgZmVhdHVyZVJlc291cmNlLFxuICAgICAgICAgICBcInR3aW5cIixcbiAgICAgICAgICAgXCJmZWF0dXJlX2FwaV90d2luXCIsXG4gICAgICAgICAgICBcIi4vbGliL2xhbWJkYV9zcmMvYXBpL2ZlYXR1cmUvaW90X2ZlYXR1cmVfYXBpX3R3aW5cIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuXG4gICAgICAgdGhpcy5mZWF0dXJlU21zTGFtYmRhID0gdGhpcy5kZWZpbmVMYW1iZGFBbmRBUEkodGhpcy5hcGlHdyxcbiAgICAgICAgICAgZmVhdHVyZVJlc291cmNlLFxuICAgICAgICAgICBcInNtc1wiLFxuICAgICAgICAgICBcImZlYXR1cmVfYXBpX3Ntc1wiLFxuICAgICAgICAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9mZWF0dXJlL2lvdF9mZWF0dXJlX2FwaV9zbXNcIixcbiAgICAgICAgICAgcHJvcHMsZmFsc2UsIHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuICAgICAgIC8vXG4gICAgICAgLy8gVGhpcyBsYW1iZGEgaXMgZ29pbmcgdG8gYmUgdXNlZCBmb3Igb24tZGV2aWNlIEdHIGRlcGxveW1lbnQuIFRoZXJlJ3Mgbm8gZXh0ZXJuYWwgQVBJIGZvciB0aGlzLlxuICAgICAgIC8vIFdlIGRvIG5lZWQgdG8gc2F2ZSB0aGUgQVJOLCB0aG91Z2gsIGluIGNhc2UgaXQgaGFzIGJlIHBhc3NlZCBvbiB0byB0aGUgQ0xJIGhhbmRsZXIuXG4gICAgICAgLy9cbiAgICAgICAvLyB0aGlzLmdnR3dMYW1iZGEgPSB0aGlzLmRlZmluZUxvY2FsR0dMYW1iZGEobmFtZVByZWZpeCxcbiAgICAgICAvLyAgICAgXCJnd19nZ19sYW1iZGFcIixcbiAgICAgICAvLyAgICAgZ2F0ZXdheVJlcHVibGlzaFRvcGljcyxcbiAgICAgICAvLyAgICAgXCIuL2xpYi9sYW1iZGFfc3JjL2FwaS9pb3RfZ2F0ZXdheV9sYW1iZGFcIilcbiAgICAgICAvL1xuICAgICAgIC8vIENvbW1vbi5vdXRwdXQodGhpcywgXCJnZ0d3TGFtYmRhQVJOXCIsIHRoaXMuZ2dHd0xhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgICAvLyAgXCJHYXRld2F5IEdHIGxhbWJkYSBBUk5cIilcblxuICAgICAgIC8vIERlZmluZSBJT1QgcnVsZXMgdGhhdCBzZVxuICAgICAgICAgICAgLy8gbmQgdHJhZmZpYyB0byBsYW1iZGFzIChhbmQgZ2l2ZSB0aGVtIHBlcnNtaXNzaW9uKVxuICAgICAgIC8vXG4gICAgICAgdGhpcy5kZWZpbmVJT1RSdWxlcyhwcm9wcyk7XG4gICAgfVxuXG4gICAgLy8gTk9URTogYXQgdGhpcyBwb2ludCBpbiB0aW1lLCBvbi1kZXZpY2UgbGFtYmRhcyBjYW4gYmUgdXAgdG8gUHl0aG9uIDMuNy5cbiAgICAvLyBFbHNld2hlcmUsIHRoZXkgY2FuIGdvIGhpZ2hlci4gU28gd2UgaGF2ZSB0byBoYXJkY29kZSBpdCBoZXJlLlxuICAgIC8vXG4gICAgLy8gZGVmaW5lTG9jYWxHR0xhbWJkYShwcmVmaXg6IHN0cmluZywgbGFtYmRhTmFtZTogc3RyaW5nLFxuICAgIC8vICAgICAgICAgICAgICAgICAgICBnYXRld2F5UmVwdWJsaXNoVG9waWNzOiBzdHJpbmcsXG4gICAgLy8gICAgICAgICAgICAgICAgICAgIHBhdGhUb0xhbWJkYTogc3RyaW5nKSB7XG4gICAgLy8gICAgIGxldCBmdW5jdGlvbk5hbWUgPSBwcmVmaXggKyBcIl9cIiArIGxhbWJkYU5hbWVcbiAgICAvLyAgICAgbGV0IGxhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBwcmVmaXggKyBsYW1iZGFOYW1lLCB7XG4gICAgLy8gICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM183LFxuICAgIC8vICAgICAgICAgaGFuZGxlcjogXCJtYWluLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgLy8gICAgICAgICBmdW5jdGlvbk5hbWU6IGZ1bmN0aW9uTmFtZSxcbiAgICAvLyAgICAgICAgIHJvbGU6IHRoaXMubG9jYWxHd0dHUm9sZSxcbiAgICAvLyAgICAgICAgIHRpbWVvdXQ6IGNvcmUuRHVyYXRpb24uc2Vjb25kcyhMQU1CREFfVElNRU9VVF9TRUNTKSxcbiAgICAvLyAgICAgICAgIGNvZGU6IG5ldyBsYW1iZGEuQXNzZXRDb2RlKHBhdGhUb0xhbWJkYSksXG4gICAgLy8gICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgIC8vICAgICAgICAgICAgIFwiTVFUVF9TVUJcIjogZ2F0ZXdheVJlcHVibGlzaFRvcGljc1xuICAgIC8vICAgICAgICAgfVxuICAgIC8vICAgICB9KTtcbiAgICAvLyAgICAgcmV0dXJuIGxhbWJkYUZ1bmN0aW9uXG4gICAgLy8gfVxuXG4gICAgLypcbiAgICAgKiBTZWN1cml0eSBhdWRpdCByZXF1aXJlcyBhIHNlcGFyYXRlIHJvbGUgcGVyIGxhbWJkYS5cbiAgICAgKi9cbiAgICBjcmVhdGVJQU1Sb2xlKGxhbWJkYU5hbWU6IHN0cmluZywgcHJvcHM6IElMYW1iZGFQcm9wcykgOiBpYW0uUm9sZSB7XG5cbiAgICAgICAgbGV0IGxhbWJkYUV4ZWNSb2xlTmFtZSA9IFwibGFtYmRhX2lhbV9yb2xlX1wiICsgbGFtYmRhTmFtZTtcblxuICAgICAgICAvLyBOT1RFOiB0aGVyZSdzIGEgbWF4IG9mIDEwIG1hbmFnZWQgcG9saWNpZXMuIElmIG1vcmUgdGhhbiB0aGF0LCBkZXBsb3ltZW50IHdpbGwgZmFpbC5cbiAgICAgICAgLy8gQWxzbywgYmVmb3JlIGZpbmFsIHJlbGVhc2UsIHdlIG5lZWQgdG8gbWFrZSB0aGVzZSBuYXJyb3dlci5cblxuICAgICAgICBsZXQgbGFtYmRhRXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAgbGFtYmRhRXhlY1JvbGVOYW1lLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICAgICAgICAgICAgcm9sZU5hbWU6IGxhbWJkYUV4ZWNSb2xlTmFtZSxcbiAgICAgICAgICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBbWF6b25SRFNGdWxsQWNjZXNzXCIpLFxuICAgICAgICAgICAgICAgICAgICBNYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvbkR5bmFtb0RCRnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJJQU1GdWxsQWNjZXNzXCIpLFxuICAgICAgICAgICAgICAgICAgICBNYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvblMzRnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJTZWNyZXRzTWFuYWdlclJlYWRXcml0ZVwiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBV1NHcmVlbmdyYXNzRnVsbEFjY2Vzc1wiKSxcbiAgICAgICAgICAgICAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJBV1NJb1RGdWxsQWNjZXNzXCIpLFxuICAgICAgICAgICAgICAgICAgICBNYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFWUENBY2Nlc3NFeGVjdXRpb25Sb2xlXCIpLFxuICAgICAgICAgICAgICAgICAgICBNYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvblRpbWVzdHJlYW1GdWxsQWNjZXNzXCIpLFxuICAgICAgICAgICAgICAgICAgICBNYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvblNTTUZ1bGxBY2Nlc3NcIilcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgICAgICAgICAgICAgICdhc3N1bWVfcm9sZSc6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzdHM6QXNzdW1lUm9sZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICAnaW52b2tlX2xhbWJkYSc6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsYW1iZGE6aW52b2tlRnVuY3Rpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibGFtYmRhOmludm9rZUFzeW5jXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkYXRlX2Nsb3VkZnJvbnQnOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiY2xvdWRmcm9udDpDcmVhdGVJbnZhbGlkYXRpb25cIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgLyogVGhpcyBpcyBzbyB3ZSBjYW4gd3JpdGUgbG9jYXRpb24gZGF0YSB0byBBV1MgTG9jYXRpb24gdHJhY2tlcnMgKi9cbiAgICAgICAgICAgICAgICAgICAgJ2dlb19sb2NhdGlvbl9yb2xlJzogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdlbzpTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86Q3JlYXRlUGxhY2VJbmRleFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86RGVsZXRlUGxhY2VJbmRleFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86QmF0Y2hEZWxldGVEZXZpY2VQb3NpdGlvbkhpc3RvcnlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkRlbGV0ZVRyYWNrZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VvOkFzc29jaWF0ZVRyYWNrZXJDb25zdW1lclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86VXBkYXRlVHJhY2tlclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86Q3JlYXRlVHJhY2tlclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86TGlzdFBsYWNlSW5kZXhlc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW86Q3JlYXRlUm91dGVDYWxjdWxhdG9yXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdlbzpCYXRjaFVwZGF0ZURldmljZVBvc2l0aW9uXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgIC8qIFRoaXMgaXMgc28gd2UgY2FuIHNlbmQgcHJvdmlzaW9uaW5nIG1lc3NhZ2VzIHZpYSBTTVMuICovXG4gICAgICAgICAgICAgICAgICAgICdzZW5kX3Ntcyc6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJtb2JpbGV0YXJnZXRpbmc6U2VuZE1lc3NhZ2VzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm1vYmlsZXRhcmdldGluZzpTZW5kVXNlcnNNZXNzYWdlc1wiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgICByZXR1cm4gbGFtYmRhRXhlY3V0aW9uUm9sZTtcbiAgICB9XG5cbiAgICAgIC8vIFNldCB1cCBJT1QgYWN0aW9ucyB0aGF0IGludm9rZSBhIGxhbWJkYS4gV2UgdXNlZCB0byBoYXZlIHRoaXMgaW4gYSBzZXBhcmF0ZVxuICAgICAgLy8gc3RhY2sgYnV0IHdlcmUgZ2V0dGluZyBuYXN0eSBjaXJjdWxhciByZWZlcmVuY2VzLCBzbyBub3cgaXQncyBkZWZpbmVkIGhlcmUuXG4gICAgICAvL1xuICAgICAgLy8gVGhpcyBJT1QgcnVsZSBzZW5kcyBhbnkgY2hhbmdlcyBpbiBkYXRhIGZyb20gdGhlIGRldmljZSBzaWRlIHRvIHRoZSBtb25pdG9yXG4gICAgICAvLyBhbmQgbGFtYmRhLiBEYXRhVHlwZXMgbWFya2VkIGFzICdzaG93X29uX3R3aW4nIHdpbGwgYmUgcmUtYnJvYWRjYXN0IHRvIGEgbW9uaXRvclxuICAgICAgLy8gdG9waWMgc28gdGhleSBjYW4gYmUgc2hvd24gb24gdGhlIGNvbnNvbGUuXG4gICAgICAvL1xuICAgIGRlZmluZUlPVFJ1bGVzKHByb3BzOiBJTGFtYmRhUHJvcHMpIHtcbiAgICAgICBjb25zdCBsYW1iZGFJb3RBY3Rpb246IExhbWJkYUFjdGlvblByb3BlcnR5ID0ge1xuICAgICAgICAgICAgZnVuY3Rpb25Bcm46IHRoaXMuZGF0YUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgICB9O1xuXG4gICAgICAgY29uc3QgaW90RGF0YVJ1bGUgPSBuZXcgaW90LkNmblRvcGljUnVsZSh0aGlzLCAnaW90X2xhbWJkYV9md2RfcnVsZScsIHtcbiAgICAgICAgICAgIHRvcGljUnVsZVBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhbWJkYTogbGFtYmRhSW90QWN0aW9uLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcnVsZURpc2FibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBzcWw6IGBTRUxFQ1QgKiBGUk9NICdzaW1wbGVpb3RfdjEvYXBwL2RhdGEvIydgLFxuICAgICAgICAgICAgICAgIGF3c0lvdFNxbFZlcnNpb246ICcyMDE2LTAzLTIzJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2UgbmVlZCB0byBnaXZlIElPVCBwZXJtaXNzaW9uIHRvIHNlbmQgdGhlIGRhdGEgdG8gbGFtYmRhIG90aGVyd2lzZSBpdCBmYWlscy5cbiAgICAgICAgLy9cbiAgICAgICB0aGlzLmRhdGFMYW1iZGEuYWRkUGVybWlzc2lvbignaW90X2FsbG93X2xhbWJkYV9pbnZva2VfcnVsZScsIHtcbiAgICAgICAgICAgIHByaW5jaXBhbDogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdpb3QuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgICAgc291cmNlQXJuOiBpb3REYXRhUnVsZS5hdHRyQXJuLFxuICAgICAgIH0pO1xuXG4gICAgICAgLy8gV2Ugc2V0IHVwIGEgc2VwYXJhdGUgcnVsZSwgd2hlcmUgLi4uL2NoZWNrdXBkYXRlLy4uLiBNUVRUIG1lc3NhZ2VzIGFyZSBzZW50IG92ZXIgdG9cbiAgICAgICAvLyB0aGUgbGFtYmRhIHRoYXQgaGFuZGxlcyB1cGRhdGVzLlxuICAgICAgIC8vXG4gICAgICAgY29uc3QgbGFtYmRhVXBkYXRlQWN0aW9uOiBMYW1iZGFBY3Rpb25Qcm9wZXJ0eSA9IHtcbiAgICAgICAgICAgIGZ1bmN0aW9uQXJuOiB0aGlzLnVwZGF0ZUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgICB9O1xuICAgICAgIGNvbnN0IGlvdFVwZGF0ZVJ1bGUgPSBuZXcgaW90LkNmblRvcGljUnVsZSh0aGlzLCAnaW90X2xhbWJkYV91cGRhdGVfcnVsZScsIHtcbiAgICAgICAgICAgIHRvcGljUnVsZVBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhbWJkYTogbGFtYmRhVXBkYXRlQWN0aW9uLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcnVsZURpc2FibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBzcWw6IGBTRUxFQ1QgKiBGUk9NICdzaW1wbGVpb3RfdjEvY2hlY2t1cGRhdGUvIydgLFxuICAgICAgICAgICAgICAgIGF3c0lvdFNxbFZlcnNpb246ICcyMDE2LTAzLTIzJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2UgbmVlZCB0byBnaXZlIElPVCBwZXJtaXNzaW9uIHRvIHNlbmQgdGhlIGRhdGEgdG8gbGFtYmRhIG90aGVyd2lzZSBpdCBmYWlscy5cbiAgICAgICAgLy9cbiAgICAgICB0aGlzLnVwZGF0ZUxhbWJkYS5hZGRQZXJtaXNzaW9uKCdpb3RfYWxsb3dfaW52b2tlX2xhbWJkYV9wZXJtaXNzaW9uJywge1xuICAgICAgICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2lvdC5hbWF6b25hd3MuY29tJyksXG4gICAgICAgICAgICBzb3VyY2VBcm46IGlvdFVwZGF0ZVJ1bGUuYXR0ckFybixcbiAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhZGRXQUZUb0FQSUdhdGV3YXkocHJvcHM6IElMYW1iZGFQcm9wcykge1xuXG4gICAgICAgIC8vIEZvciBzZWN1cml0eSByZWFzb25zLCB3ZSBhbHNvIGFkZCBhIFdlYiBBcHBsaWNhdGlvbiBGaXJld2FsbCBpbiBmcm9udCBvZiB0aGUgQVBJXG4gICAgICAgIC8vIEdhdGV3YXkuIFRoaXMgdXNlZCB0byBiZSBpbiBhIHNlcGFyYXRlIHN0YWNrIGJ1dCBoYWQgdG8gYmUgbW92ZWQgaGVyZSB0byBhdm9pZFxuICAgICAgICAvLyBjaXJjdWxhciByZWZlcmVuY2VzLlxuXG4gICAgICAgIC8vIFJvdXRpbmUgdG8gc2V0IHVwIFdBRiBydWxlcy4gRGlyZWN0bHkgYmFzZWQgb246XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9jZGstcGF0dGVybnMvc2VydmVybGVzcy9ibG9iL21haW4vdGhlLXdhZi1hcGlnYXRld2F5L3R5cGVzY3JpcHQvbGliL3RoZS13YWYtc3RhY2sudHNcblxuICAgICAgICBsZXQgd2FmUnVsZXM6QXJyYXk8d2FmLkNmbldlYkFDTC5SdWxlUHJvcGVydHk+ICA9IFtdO1xuXG4gICAgICAgIC8vIEFXUyBNYW5hZ2VkIFJ1bGVzXG4gICAgICAgIC8vIFRoZXNlIGFyZSBiYXNpYyBydWxlcy4gTm90ZSB0aGF0IGl0IGV4Y2x1ZGVzIHNpemUgcmVzdHJpY3Rpb25zIG9uIHRoZSBib2R5XG4gICAgICAgIC8vIHNvIGZpbGUgdXBsb2FkL2Rvd25sb2Fkcy4gSWYgdGhlcmUgYXJlIGlzc3VlcyB3aXRoIHRoaXMsIHlvdSBtYXkgd2FudCB0b1xuICAgICAgICAvLyBhZGp1c3QgdGhpcyBydWxlLlxuICAgICAgICAvL1xuICAgICAgICBsZXQgYXdzTWFuYWdlZFJ1bGVzOndhZi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5ICA9IHtcbiAgICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7bm9uZToge319LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgICBleGNsdWRlZFJ1bGVzOiBbe25hbWU6ICdTaXplUmVzdHJpY3Rpb25zX0JPRFknfV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdhd3NDb21tb25SdWxlcycsXG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHdhZlJ1bGVzLnB1c2goYXdzTWFuYWdlZFJ1bGVzKTtcblxuICAgICAgICAvLyBBV1MgaXAgcmVwdXRhdGlvbiBMaXN0XG4gICAgICAgIC8vXG4gICAgICAgIGxldCBhd3NJUFJlcExpc3Q6d2FmLkNmbldlYkFDTC5SdWxlUHJvcGVydHkgID0ge1xuICAgICAgICAgIG5hbWU6ICdhd3NJUFJlcHV0YXRpb24nLFxuICAgICAgICAgIHByaW9yaXR5OiAyLFxuICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7bm9uZToge319LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQW1hem9uSXBSZXB1dGF0aW9uTGlzdCcsXG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgICBleGNsdWRlZFJ1bGVzOiBbXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ2F3c1JlcHV0YXRpb24nLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB3YWZSdWxlcy5wdXNoKGF3c0lQUmVwTGlzdCk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIFdlYiBBQ0xcbiAgICAgICAgbGV0IHdlYkFDTCA9IG5ldyB3YWYuQ2ZuV2ViQUNMKHRoaXMsICdXZWJBQ0wnLCB7XG4gICAgICAgICAgZGVmYXVsdEFjdGlvbjoge1xuICAgICAgICAgICAgYWxsb3c6IHt9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnd2ViQUNMJyxcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJ1bGVzOiB3YWZSdWxlc1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgYXBpR2F0ZXdheUFSTiA9IGBhcm46YXdzOmFwaWdhdGV3YXk6JHtwcm9wcy5yZWdpb259OjovcmVzdGFwaXMvJHt0aGlzLmFwaUd3LnJlc3RBcGlJZH0vc3RhZ2VzLyR7dGhpcy5hcGlHdy5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VOYW1lfWBcblxuICAgICAgICAvLyBGb3IgZXhhbXBsZTogYXJuOmF3czphcGlnYXRld2F5OnVzLXdlc3QtMjo6L3Jlc3RhcGlzL2x2cjIyc3F6dmEvc3RhZ2VzL2RldlxuXG4gICAgICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBnYXRld2F5XG4gICAgICAgIC8vXG4gICAgICAgIG5ldyB3YWYuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ1dlYkFDTEFzc29jaWF0aW9uJywge1xuICAgICAgICAgIHdlYkFjbEFybjogd2ViQUNMLmF0dHJBcm4sXG4gICAgICAgICAgcmVzb3VyY2VBcm46IGFwaUdhdGV3YXlBUk5cbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIHVzZWQgdG8gZGVmaW5lIGVhY2ggbGFtYmRhIGFuZCB0aGUgYXNzb2NpYXRlZCBBUEkgZ2F0ZXdheSBSRVNUIHZlcmJcbiAgICAvLyBOT1RFIHRoYXQgaWYgdGhlIGxhbWJkYSB3YW50cyB0byB1c2UgcmVsYXRpdmUgaW1wb3J0cywgaXQgd2lsbCBoYXZlIHRvIGhhdmUgaXRzXG4gICAgLy8gY29kZSBpbnNpZGUgYSBQeXRob24gbW9kdWxlIGFuZCB0aGUgaGFuZGxlciB3aWxsIGhhdmUgdG8gYmUgbW9kaWZpZWQgKHNlZSBhYm92ZVxuICAgIC8vIGZvciBleGFtcGxlKS5cbiAgICAvL1xuICAgIGRlZmluZUxhbWJkYUFuZEFQSShyZXN0QXBpOiBhcGkuUmVzdEFwaSxcbiAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50UmVzb3VyY2U6IGFwaS5SZXNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgcmVzdFJlc291cmNlTmFtZTogc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICBsYW1iZGFOYW1lOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgIHBhdGhUb0xhbWJkYTogc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICBwcm9wczogSUxhbWJkYVByb3BzLFxuICAgICAgICAgICAgICAgICAgICAgICBkb0FueTogYm9vbGVhbixcbiAgICAgICAgICAgICAgICAgICAgICAgZG9Qb3N0OiBib29sZWFuLFxuICAgICAgICAgICAgICAgICAgICAgICBkb0dldDogYm9vbGVhbixcbiAgICAgICAgICAgICAgICAgICAgICAgZG9QdXQ6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgICAgICAgIGRvRGVsZXRlOiBib29sZWFuLFxuICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiBzdHJpbmc9XCJtYWluLmxhbWJkYV9oYW5kbGVyXCIpIHtcblxuICAgICAgICBsZXQgcHJlZml4ID0gcHJvcHMucHJlZml4O1xuICAgICAgICBsZXQgZnVuY3Rpb25OYW1lID0gcHJlZml4ICsgXCJfXCIgKyBsYW1iZGFOYW1lXG5cbiAgICAgICAgLy8gV2Ugb25seSBkZWZpbmUgdGhlIGtleSB0byBnZXQgZGIgY3JlZGVudGlhbHMgb3V0IG9mIHRoZSBzZWNyZXRzbWFuYWdlci5cbiAgICAgICAgLy8gVGhlIGtleSByZXR1cm5zIGFsbCBkYXRhYmFzZSBjb25uZWN0aW9uIGRhdGEgbmVlZGVkIGF0IHJ1bnRpbWUuXG4gICAgICAgIC8vXG4gICAgICAgIGxldCBsYW1iZGFfZW52IDoge1trZXk6IHN0cmluZ106IGFueX09IHtcbiAgICAgICAgICAgICAgICBcIkRCX1BBU1NfS0VZXCI6IHByb3BzLmRiUGFzc3dvcmRLZXksXG4gICAgICAgICAgICAgICAgXCJEWU5BTU9EQl9UQUJMRVwiOiBwcm9wcy5keW5hbW9EQi5keW5hbW9EQlRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgICBcIlBSRUZJWFwiOiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgXCJJT1RfRU5EUE9JTlRcIjogcHJvcHMuc3RhdGljSW90LmlvdE1vbml0b3JFbmRwb2ludCxcbiAgICAgICAgICAgICAgICBcIlNUQUdFXCI6IHByb3BzLnN0YWdlLFxuICAgICAgICAgICAgICAgIFwiSU9UX0xPR0xFVkVMXCI6IHByb3BzLmxvZ0xldmVsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGlmIChwcm9wcy50aW1lc3RyZWFtKSB7XG4gICAgICAgICAgICBsYW1iZGFfZW52W1wiVFNfREFUQUJBU0VcIl0gPSBwcm9wcy50aW1lc3RyZWFtLmRhdGFiYXNlTmFtZTtcbiAgICAgICAgICAgIGxhbWJkYV9lbnZbXCJUU19UQUJMRU5BTUVcIl0gPSBwcm9wcy50aW1lc3RyZWFtLnRhYmxlTmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBsYW1iZGFSb2xlID0gdGhpcy5jcmVhdGVJQU1Sb2xlKGZ1bmN0aW9uTmFtZSwgcHJvcHMpO1xuXG4gICAgICAgIGxldCBsYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJsYW1iZGFfXCIgKyBsYW1iZGFOYW1lLCB7XG4gICAgICAgICAgICBydW50aW1lOiBDb21tb24ucHl0aG9uUnVudGltZVZlcnNpb24oKSxcbiAgICAgICAgICAgIGhhbmRsZXI6IGhhbmRsZXIsXG4gICAgICAgICAgICBsYXllcnM6IHByb3BzLmxheWVyLmFsbExheWVycyxcbiAgICAgICAgICAgIGZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lLFxuICAgICAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvcHMubGFtYmRhVGltZU91dFNlY3MpLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5zZWN1cml0eUdyb3VwLCBwcm9wcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgY29kZTogbmV3IGxhbWJkYS5Bc3NldENvZGUocGF0aFRvTGFtYmRhKSxcbiAgICAgICAgICAgIGVudmlyb25tZW50OiBsYW1iZGFfZW52XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCB0aGlzUmVzb3VyY2UgPSBwYXJlbnRSZXNvdXJjZS5hZGRSZXNvdXJjZShyZXN0UmVzb3VyY2VOYW1lKTtcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJBZGRpbmcgcmVzb3VyY2UgXCIgKyByZXN0UmVzb3VyY2VOYW1lICsgXCIgdG8gcGFyZW50OiBcIiArIHBhcmVudFJlc291cmNlLnRvU3RyaW5nKCkpXG4gICAgICAgIGxldCBsYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGkuTGFtYmRhSW50ZWdyYXRpb24obGFtYmRhRnVuY3Rpb24pO1xuXG4gICAgICAgIC8vIE5PVEU6IGFsbCB0aGVzZSBnbyB0byB0aGUgc2FtZSBmdW5jdGlvbi4gVGhlIGZ1bmN0aW9uIGNoZWNrcyB0aGUgaW5jb21pbmdcbiAgICAgICAgLy8gaHR0cCB2ZXJiIHRvIHJvdXRlIHdoYXQgaXQgc2hvdWxkIGRvLiBXZSBjb3VsZCBqdXN0IGFzIGVhc2lseSBoYXZlIHNldCB1cFxuICAgICAgICAvLyBhIHNlcGFyYXRlIGxhbWJkYSBmb3IgZWFjaCBvbmUuXG4gICAgICAgIC8vXG4gICAgICAgIGlmIChkb0FueSkge1xuICAgICAgICAgICAgdGhpc1Jlc291cmNlLmFkZFByb3h5KHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGxhbWJkYUludGVncmF0aW9uLFxuICAgICAgICAgICAgICAgIGFueU1ldGhvZDogdHJ1ZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChkb1Bvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZE1ldGhvZCh0aGlzUmVzb3VyY2UsICdQT1NUJywgbGFtYmRhSW50ZWdyYXRpb24sIHByb3BzLnVzZVNTTyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZG9QdXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZE1ldGhvZCh0aGlzUmVzb3VyY2UsICdQVVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwgcHJvcHMudXNlU1NPKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkb0dldCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkTWV0aG9kKHRoaXNSZXNvdXJjZSwgJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCBwcm9wcy51c2VTU08pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRvRGVsZXRlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRNZXRob2QodGhpc1Jlc291cmNlLCAnREVMRVRFJywgbGFtYmRhSW50ZWdyYXRpb24sIHByb3BzLnVzZVNTTyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBXZSBjYW4gb3V0cHV0IHRoZSBsYW1iZGEgbmFtZXMgYW5kIEFSTiBmb3IgbGF0ZXIgcGhhc2VzIGluIGRlcGxveW1lbnRcbiAgICAgICAgLy8gdGhleSBhcmUgc2F2ZWQgaW4gdGhlIG91dHB1dCBKU09OIGZpbGUuIEhvd2V2ZXIsIHRoZSBuYW1lcyBoYXZlIHRvIGJlIGNvbnZlcnRlZFxuICAgICAgICAvLyBmcm9tIHNuYWtlX2Nhc2UgdG8gY2FtZWxDYXNlIHRvIGxldCBDZm5PdXRwdXQgd29yay5cbiAgICAgICAgLy8gT3JkaW5hcmlseSB5b3UgZG9uJ3QgbmVlZCB0byBvdXRwdXQgdGhlc2Ugc2luY2UgdGhlIEFQSSBHYXRld2F5IGNhbGxzIHRoZW0uXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEJ1dCBpZiBhIGxhbWJkYSBuZWVkcyB0byBiZSBkaXJlY3RseSBpbnZva2VkIGZyb20gYSBzY3JpcHQgZmlsZSB2aWEgQVJOLCB0aGVuXG4gICAgICAgIC8vIGl0IG5lZWRzIHRvIGJlIHBhc3NlZCBvbiBoZXJlLlxuICAgICAgICAvL1xuICAgICAgICAvLyBsZXQgY2xlYW5OYW1lID0gQ29tbW9uLnNuYWtlVG9DYW1lbChmdW5jdGlvbk5hbWUpXG4gICAgICAgIC8vIENvbW1vbi5vdXRwdXQodGhpcywgY2xlYW5OYW1lLFxuICAgICAgICAvLyAgICAgY2xlYW5OYW1lLFxuICAgICAgICAvLyAgICAgXCJMYW1iZGEgQ3JlYXRlZCBOYW1lXCIpXG4gICAgICAgIC8vIENvbW1vbi5vdXRwdXQodGhpcywgXCJsYW1iZGFcIiArIGNsZWFuTmFtZSArIFwiQXJuXCIsXG4gICAgICAgIC8vICAgICByZXN1bHQuZnVuY3Rpb25Bcm4sXG4gICAgICAgIC8vICAgICBcIkxhbWJkYSBBUk5cIilcblxuICAgICAgICByZXR1cm4gbGFtYmRhRnVuY3Rpb247XG4gICAgfVxuXG4gICAgLy8gVXRpbGl0eSByb3V0aW5lIHRvIGFkZCBhIGxhbWJkYSBpbnRlZ3JhdGlvbiB0byBhIFJFU1QgQVBJIGZvciBhIGdpdmVuIEhUVFAgdmVyYlxuICAgIC8vIFdlJ3JlIGRvaW5nIHRoaXMgb25lIHZlcmIgYXQgYSB0aW1lIGluc3RlYWQgb2YgZm9yIGV2ZXJ5IHBvc3NpYmxlIEhUVFAgdG8gYWxsb3dcbiAgICAvLyBvdGhlciB2ZXJicyB0byBiZSB1c2VkIGZvciBvdGhlciBwdXJwb3NlcyBpbiB0aGUgZnV0dXJlLlxuICAgIC8vXG4gICAgLy8gSWYgd2UncmUgdXNpbmcgU1NPLCB0aGUgYXV0aG9yaXplciB3aWxsIGJlIHNldCB0byBJQU0uIElmIG5vdCwgd2UncmUgZ29pbmcgdG8gdXNlXG4gICAgLy8gQ29nbml0byBhdXRob3JpemF0aW9uLlxuICAgIC8vXG4gICAgYWRkTWV0aG9kKHJlc291cmNlOiBhcGkuUmVzb3VyY2UsIGh0dHBWZXJiOiBzdHJpbmcsIGludGVncmF0aW9uOiBhcGkuTGFtYmRhSW50ZWdyYXRpb24sXG4gICAgICAgICAgICAgIHVzZVNTTzogYm9vbGVhbikge1xuICAgICAgICBpZiAodXNlU1NPKSB7XG4gICAgICAgICAgICByZXNvdXJjZS5hZGRNZXRob2QoaHR0cFZlcmIsIGludGVncmF0aW9uLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLklBTVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJBZGRpbmcgTWV0aG9kOiBcIiArIGh0dHBWZXJiICsgXCIgdG8gcmVzb3VyY2U6IFwiICsgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICByZXNvdXJjZS5hZGRNZXRob2QoaHR0cFZlcmIsIGludGVncmF0aW9uLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgICAgICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGhvcml6ZXJJZDogdGhpcy5sYW1iZGFBdXRob3JpemVyLnJlZlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gRm9yIGN1c3RvbSBhdXRob3JpemVyIGFib3ZlLCB1c2UgdGhpcyBpbnN0ZWFkLlxuICAgIC8vXG4gICAgLy9hdXRob3JpemVyOiB0aGlzLmFwaUF1dGhvcml6ZXJcbiAgICAvLyBhdXRob3JpemF0aW9uVHlwZTogYXBpLkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAvLyBhdXRob3JpemVyOiB7XG4gICAgLy8gICAgIGF1dGhvcml6ZXJJZDogdGhpcy5hcGlBdXRob3JpemVyLmF1dGhvcml6ZXJJZFxuICAgIC8vIH1cblxuICAgIC8vIFRoaXMgbWV0aG9kIGlzIHVzZWQgdG8gZ28gYmFjayB0byB0aGUgbGFtYmRhcyB0aGF0IHdlIG5lZWQgYW5kIGFkZCB0aGUgSU9UIGVuZHBvaW50XG4gICAgLy8gdG8gdGhlbSBhcyBhbiBlbnZpcm9ubWVudCB2YXJpYWJsZS5cbiAgICAvL1xuICAgIHB1YmxpYyBzZXRJb3RFbmRwb2ludChpb3RFbmRwb2ludDogc3RyaW5nKSB7XG5cbiAgICB9XG59XG5cblxuLy9cbi8vIEluIGNhc2Ugd2UgbmVlZCB0byBhZGQgQ09SUyBzdXBwb3J0IHRvIHRoZSBBUElcbi8vXG4gZXhwb3J0IGZ1bmN0aW9uIGFkZENvcnNPcHRpb25zKGFwaVJlc291cmNlOiBhcGkuSVJlc291cmNlKSB7XG4gICAgIGFwaVJlc291cmNlLmFkZE1ldGhvZCgnT1BUSU9OUycsIG5ldyBhcGkuTW9ja0ludGVncmF0aW9uKHtcbiAgICAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbe1xuICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInQ29udGVudC1UeXBlLFgtQW16LURhdGUsQXV0aG9yaXphdGlvbixYLUFwaS1LZXksWC1BbXotU2VjdXJpdHktVG9rZW4sWC1BbXotVXNlci1BZ2VudCdcIixcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiBcIidmYWxzZSdcIixcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ09QVElPTlMsR0VULFBVVCxQT1NULERFTEVURSdcIixcbiAgICAgICAgICAgICB9LFxuICAgICAgICAgfV0sXG4gICAgICAgICBwYXNzdGhyb3VnaEJlaGF2aW9yOiBhcGkuUGFzc3Rocm91Z2hCZWhhdmlvci5ORVZFUixcbiAgICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogXCJ7XFxcInN0YXR1c0NvZGVcXFwiOiAyMDB9XCJcbiAgICAgICAgIH0sXG4gICAgIH0pLCB7XG4gICAgICAgICBtZXRob2RSZXNwb25zZXM6IFt7XG4gICAgICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgICAgIH0sXG4gICAgICAgICB9XVxuICAgICB9KVxuIH1cblxuXG4iXX0=