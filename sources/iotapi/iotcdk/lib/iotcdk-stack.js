"use strict";
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.IotcdkStack = void 0;
const cdk = require("aws-cdk-lib");
const ssm = require("aws-cdk-lib/aws-ssm");
const cdk_preinstall_1 = require("./constructs/cdk_preinstall");
const cdk_postinstall_1 = require("./constructs/cdk_postinstall");
const cdk_cognito_1 = require("./constructs/cdk_cognito");
const cdk_dynamodb_1 = require("./constructs/cdk_dynamodb");
// import { CDKDashboard } from './constructs/cdk_dashboard';
const cdk_database_1 = require("./constructs/cdk_database");
const cdk_timestream_1 = require("./constructs/cdk_timestream");
const cdk_iam_1 = require("./constructs/cdk_iam");
const cdk_lambda_1 = require("./constructs/cdk_lambda");
// import { CDKQueue } from './constructs/cdk_queue';
const cdk_network_1 = require("./constructs/cdk_network");
const cdk_s3_1 = require("./constructs/cdk_s3");
// import { CDKKinesis } from './constructs/cdk_kinesis';
// import { CDKWebApp } from './constructs/cdk_webapp';
const uuid_1 = require("uuid");
const common_1 = require("./constructs/common");
const cdk_lambdalayer_1 = require("./constructs/cdk_lambdalayer");
const cdk_staticiot_1 = require("./constructs/cdk_staticiot");
var path = require('path');
var SIMPLEIOT_VERSION = "0.0.1";
// The database, IOT, and lambda section have cross-dependencies on each other.
// They have to be built in multiple stages and in the right order:
//
// - Create IAM roles for lambdas to be able to access everything.
// - Create VPC for database.
// - Create the database inside the VPC and bastion host and get the endpoints.
// - Create the Lambda Layers that will be used by all lambdas.
// - Static Lambda to be used for CFN IOT creation and management.
// - CFN CustomResource for creation of the IOT resources (calls the static lambda)
// - Getting IOT endpoints and resources needed from CFN.
// - Creating all the other Lambdas and APIs. The DB and IOT endpoints needs to be passed to
//   these as environment variables. They also need to be in the VPC so they can access the
//   database.
// - Create the Timestream DB.
// - We use               the lambda ARNs adn Timestream DB name and table to create a set of IOT rules.
// - Define IOT rules pointing at above lambdas.
// - Write out all the items we need to write for CLI support.
//
const RUN_PREINSTALL_STEP = false;
const CREATE_IAM = true;
const CREATE_COGNITO = true;
const CREATE_NETWORK = true;
const CREATE_DATABASE = true;
const CREATE_DYNAMODB = true;
const CREATE_LAMBDA = true;
const CREATE_LAMBDALAYER = true;
const CREATE_STATICIOT = true;
const CREATE_S3 = true;
const CREATE_TIMESTREAM = true;
const CREATE_KINESIS = false;
// Enable this if you want to have a post-install clean-up step defined.
//
const RUN_POSTINSTALL_STEP = false;
const MAX_DB_GENERATED_PASSWORD_LENGTH = 15; // max database length (if not specified in bootstrap)
class IotcdkStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a, _b, _c, _d, _e, _f;
        super(scope, id, props);
        let IOT_DEFAULTS_FILE = (_a = process.env["IOT_DEFAULTS_FILE"]) !== null && _a !== void 0 ? _a : "**IOT_DEFAULTS_FILE_UNDEFINED**";
        let IOT_TEAM_PATH = (_b = process.env["IOT_TEAM_PATH"]) !== null && _b !== void 0 ? _b : "**IOT_TEAM_PATH_UNDEFINED**";
        let bootstrap_path = path.join(IOT_TEAM_PATH, "bootstrap.json");
        let MY_IP = (_c = process.env["MY_IP"]) !== null && _c !== void 0 ? _c : "**MY_IP_UNDEFINED**";
        let POSTGRES_FULL_VERSION = (_d = process.env["POSTGRES_FULL_VERSION"]) !== null && _d !== void 0 ? _d : "**POSTGRES_FULL_UNDEFINED**";
        let POSTGRES_MAJOR_VERSION = (_e = process.env["POSTGRES_MAJOR_VERSION"]) !== null && _e !== void 0 ? _e : "**POSTGRES_MAJOR_UNDEFINED**";
        let DATABASE_USE_AURORA = (_f = (process.env["DATABASE_USE_AURORA"] == 'True')) !== null && _f !== void 0 ? _f : "**DATABASE_USE_AURORA_UNDEFINED**";
        // These are loaded dynamically from the JSON files created in the bootstrap
        // phase of installation. The bootstrap file is in ~/.simpleiot/{profile} and
        // the defaults.json file is in the installer path.
        //
        Promise.resolve().then(() => require(bootstrap_path)).then(bootstrap => {
            Promise.resolve().then(() => require(IOT_DEFAULTS_FILE)).then(defaults => {
                // We merge them together and pass them on.
                //
                let config = Object.assign({}, bootstrap, defaults);
                // This prefix is appended to everything so we can run different builds
                let namePrefix = config.name_prefix;
                if (!namePrefix || namePrefix.length === 0) {
                    namePrefix = "iot";
                }
                let stage = config.stage;
                if (!stage || stage.length === 0) {
                    stage = "dev";
                }
                let longUuid = (0, uuid_1.v4)();
                let lastPart = longUuid.split('-').pop();
                let uuid = lastPart ? lastPart : "BADUUID";
                let prefix = namePrefix + "_" + stage;
                config['stage'] = stage;
                config['uuid'] = uuid;
                config['prefix'] = prefix;
                let tags = {
                    framework: "simpleiot:" + config.simpleiot_version,
                    install_team: config.team,
                    stage: stage,
                    uuid: uuid
                };
                this.createStringParam("simpleiot_version", config.simpleiot_version, "SimpleIOT Version");
                //////////////////////////////////////////////////////////////////////
                // PRE-INSTALL
                // This will run the Pre-Install script, if specified.
                //
                if (RUN_PREINSTALL_STEP) {
                    console.log("- Preinstall Step");
                    this.preInstall = new cdk_preinstall_1.CDKPreInstall(this, "preinstall", {
                        tags: tags
                    });
                }
                //////////////////////////////////////////////////////////////////////
                // IAM
                // This will create the IAM roles needed by IOT and Lambda.
                //
                if (CREATE_IAM) {
                    console.log("- Processing IAM");
                    this.iam = new cdk_iam_1.CDKIam(this, "iam", {
                        tags: tags,
                        prefix: prefix,
                        stage: stage,
                        uuid: uuid
                    });
                }
                //////////////////////////////////////////////////////////////////////
                // Cognito./
                // This creates the Cognito User Pool and Identity needed by dashboard
                // and APIs to access IOT. In the full release this would be restricted to
                // those with proper access. The client ID will then need to be passed
                // to the dashboard so it can update its config settings.
                //
                if (CREATE_COGNITO) {
                    console.log("- Processing COGNITO");
                    this.cognito = new cdk_cognito_1.CDKCognito(this, "cognito", {
                        tags: tags,
                        useSSO: config.use_sso,
                        prefix: prefix,
                        uuid: uuid
                    });
                    this.cognito.node.addDependency(this.iam);
                    // Cognito Outputs
                    //
                    // We output the values that need to be saved for later phases in deployment
                    // they are saved in the output JSON file.
                    // NOTE: If we're in SSO mode, we won't be creating Cognito user pools so we can skip these.
                    //
                    if (!config.use_sso) {
                        common_1.Common.output(this, "cognitoSigninUrl", this.cognito.signInUrl, "Cognito Sign-In URL");
                        common_1.Common.output(this, "cognitoSigninDomainUrl", this.cognito.domain.baseUrl(), "Cognito Sign-In Domain Url");
                        common_1.Common.output(this, "cognitoSigninDomainName", this.cognito.domain.domainName, "Cognito Sign-In Domain Name");
                        common_1.Common.output(this, "cognitoUserPoolName", this.cognito.userPoolName, "Cognito User Pool Name");
                        common_1.Common.output(this, "cognitoUserPoolId", this.cognito.userPool.userPoolId, "Cognito User Pool ID");
                        common_1.Common.output(this, "cognitoUserPoolArn", this.cognito.userPool.userPoolArn, "Cognito User Pool Arn");
                        common_1.Common.output(this, "cognitoClientId", this.cognito.userPoolClient.userPoolClientId, "Cognito Client ID");
                    }
                    // Need to output these so they can be added to the configuration files
                    // and used during provisioning of gateways.
                    //
                    common_1.Common.output(this, "cognitoIdentityPoolName", this.cognito.identityPoolName, "Cognito Identity Pool Name");
                    common_1.Common.output(this, "cognitoIdentityPoolId", this.cognito.identityPool.ref, "Cognito Identity Pool ID");
                    common_1.Common.output(this, "cognitoAuthRoleName", this.cognito.authRole.roleName, "Cognito Authenticated Role Name");
                    common_1.Common.output(this, "cognitoAuthRoleARN", this.cognito.authRole.roleArn, "Cognito Authenticated Role ARN");
                    this.createBoolParam("with_cognito", true, "Feature: with Cognito");
                }
                else {
                    this.createBoolParam("with_cognito", false, "Feature: with Cognito");
                }
                //////////////////////////////////////////////////////////////////////
                // S3.
                // Buckets for access to static media.
                //
                if (CREATE_S3) {
                    console.log("- Processing S3");
                    let staticRoot = "./static";
                    this.s3 = new cdk_s3_1.CDKS3(this, "s3", {
                        tags: tags,
                        prefix: prefix,
                        stage: stage,
                        uuid: uuid,
                        s3UploadRoot: staticRoot
                    });
                    // We output the values that need to be saved for later phases in deployment
                    // they are saved in the output JSON file
                    //
                    // Firmware Update bucket and CloudFront distribution
                    //
                    common_1.Common.output(this, "fwUpdateBucketName", this.s3.fwUpdateBucketName, "FW Update Bucket Name");
                    common_1.Common.output(this, "fwUpdateBucketArn", this.s3.fwUpdateBucket.bucketArn, "FW Update Bucket ARN");
                    common_1.Common.output(this, "fwUpdateCFDistributionId", this.s3.fwUpdateCFDistribution.distributionId, "Firmware Update Cloudfront Distribution ID");
                    common_1.Common.output(this, "fwUpdateDownloadDomain", this.s3.fwUpdateCFDistribution.distributionDomainName, "Firmware Update Cloudfront Domain Name");
                    // Code Template bucket (not accessed externally)
                    //
                    common_1.Common.output(this, "templateBucketName", this.s3.templateBucketName, "Template Bucket Name");
                    common_1.Common.output(this, "templateBucketArn", this.s3.templateBucket.bucketArn, "Template Bucket Arn");
                    // Twin media uploads (GLB/USDZ/HDR files for models)
                    //
                    common_1.Common.output(this, "twinMediaBucketName", this.s3.twinMediaBucketName, "Twin Media Bucket Name");
                    common_1.Common.output(this, "twinMediaBucketArn", this.s3.twinMediaBucket.bucketArn, "Twin Media Bucket Arn");
                    // We don't want direct access to the S3 bucket. All GETs have to
                    // go through CloudFront.
                    //
                    common_1.Common.output(this, "twinMediaBucketUrl", this.s3.twinMediaBucket.urlForObject(""), "Twin Media Bucket Url");
                    common_1.Common.output(this, "twinMediaCFDistributionId", this.s3.twinMediaCFDistribution.distributionId, "Twin Media Cloudfront Distribution ID");
                    common_1.Common.output(this, "twinMediaDomain", this.s3.twinMediaCFDistribution.distributionDomainName, "Twin Media Cloudfront Domain Name");
                    // Code Generator bundles bucket (not accessed externally)
                    //
                    common_1.Common.output(this, "generatorBucketName", this.s3.generatorBucketName, "Generator Bucket Name");
                    common_1.Common.output(this, "generatorBucketArn", this.s3.generatorBucket.bucketArn, "Generator Bucket Arn");
                    // Web dashboard bucket
                    //
                    common_1.Common.output(this, "dashboardBucketName", this.s3.dashboardBucketName, "Dashboard Bucket Name");
                    common_1.Common.output(this, "dashboardBucketArn", this.s3.dashboardBucket.bucketArn, "Dashboard Bucket Arn");
                    common_1.Common.output(this, "dashboardCFDistributionId", this.s3.dashboardCFDistribution.distributionId, "Dashboard Cloudfront Distribution ID");
                    // This is the big one. You go here to login to the web dashboard.
                    // Note that this is just the domain name, you have to add the "https://"
                    //
                    common_1.Common.output(this, "dashboardDomainName", this.s3.dashboardCFDistribution.distributionDomainName, "Dashboard Website Domain");
                }
                //////////////////////////////////////////////////////////////////////
                // Network/VPC
                // This will create the networking layer needed by other components.
                // This is primarily the custom VP.
                //
                // NOTE: for testing, you can specify an existing VPC and Security Group
                //
                if (CREATE_NETWORK) {
                    console.log("- Processing NETWORK/VPC");
                    this.network = new cdk_network_1.CDKNetwork(this, "network", {
                        tags: tags,
                        prefix: prefix,
                        uuid: uuid,
                        stage: stage
                    });
                }
                this.network.node.addDependency(this.iam);
                //////////////////////////////////////////////////////////////////////
                /// DynamoDB
                //
                // The raw data received via both IOT and REST APIs are saved in DynamoDB.
                // This can be used to run analytics.
                //
                // The values are sent by the lambdas receiving the SET data.
                //
                if (CREATE_DYNAMODB) {
                    console.log("- Processing DYNAMODB");
                    this.dynamodb = new cdk_dynamodb_1.CDKDynamoDB(this, "dynamodb", {
                        tags: tags,
                        prefix: prefix,
                        uuid: uuid,
                        vpc: this.network.vpc,
                        tableName: "dynamo_table"
                    });
                    this.dynamodb.node.addDependency(this.network);
                    common_1.Common.output(this, "dynamoDBTable", this.dynamodb.dynamoDBTable.tableName, "DynamoDB table name");
                    this.createBoolParam("with_dynamodb", true, "Feature: with DynamoDB");
                }
                else {
                    this.createBoolParam("with_dynamodb", false, "Feature: with DynamoDB");
                }
                //////////////////////////////////////////////////////////////////////
                // RDS databases.
                //
                // This will create an RDS instance inside a VPC and a
                // bastion host that can be used to SSH remotely into it. The SSH
                // is needed if you want to use the DB ingester loaders from a desktop
                // (useful for development) or any other host without direct access to
                // the VPC.
                //
                // NOTE that the EC2 SSH keypair must be created manually
                // inside the account and the name is passed to this function.
                //
                // NOTE: for a development system, we're going to use a small RDS Postgres instance.
                // For a production system, you will want to switch to a scalable AuroraPostgres version.
                // Example of creating this is in the CDKDatabase source, commented out. However, be aware that
                // Aurora does not have a free tier.
                //
                // In iotcdk/tasks.py, you will also need to indicate that you're using
                //
                if (CREATE_DATABASE) {
                    console.log("- Processing DATABASE/RDS");
                    this.database = new cdk_database_1.CDKDatabase(this, "db", {
                        tags: tags,
                        prefix: prefix,
                        uuid: uuid,
                        vpc: this.network.vpc,
                        useAurora: DATABASE_USE_AURORA,
                        myIp: MY_IP,
                        postgresFullVersion: POSTGRES_FULL_VERSION,
                        postgresMajorVersion: POSTGRES_MAJOR_VERSION,
                        dbPort: config.database_tcp_port,
                        httpsPort: config.https_tcp_port,
                        dbUsername: config.db_username,
                        dbPasswordKey: config.db_password_key,
                        allocatedStorage: config.db_storage_size_gb,
                        maxAllocatedStorage: config.db_max_storage_size_gb,
                        dbName: config.db_name,
                        keypairName: config.bastion_ssh_ec2_keypair_name,
                        maxGeneratedPasswordLength: MAX_DB_GENERATED_PASSWORD_LENGTH
                    });
                    this.database.node.addDependency(this.network);
                    // We output the values that need to be saved for later phases in deployment
                    // in the output JSON file, which will then be loaded into config files.
                    //
                    common_1.Common.output(this, "bastionHostSSHDns", this.database.bastion.instancePublicDnsName, "Bastion Host SSH DNS");
                    common_1.Common.output(this, "bastionHostSSHIp", this.database.bastion.instancePublicIp, "Bastion Host SSH IP");
                    // CDKDatabase unifies the hostname, whether it's Aurora Cluster or Single RDS instance.
                    //
                    common_1.Common.output(this, "dbHostname", this.database.databaseHostname, "Database endpoint hostname");
                    common_1.Common.output(this, "bastionSSHAllowedIP", MY_IP, "IP address with SSH access to bastion host");
                }
                //////////////////////////////////////////////////////////////////////
                // LAMBDALAYER
                // This will create the layers used by all lambdas.
                //
                if (CREATE_LAMBDALAYER) {
                    console.log("- Processing LAMBDA LAYER");
                    this.lambdaLayer = new cdk_lambdalayer_1.CDKLambdaLayer(this, "lambdalayer", {
                        tags: tags,
                        prefix: prefix,
                        uuid: uuid,
                        stage: stage
                    });
                }
                //////////////////////////////////////////////////////////////////////
                // IOT Static Components (for use during set up and deletion)
                //
                if (CREATE_STATICIOT) {
                    console.log("- Processing IOT INITIALIZER FOR CDK");
                    this.staticIot = new cdk_staticiot_1.CDKStaticIOT(this, "staticiot", {
                        tags: tags,
                        prefix: prefix,
                        stage: stage,
                        uuid: uuid,
                        logLevel: config.log_level,
                        vpc: this.network.vpc,
                        iam: this.iam,
                        layer: this.lambdaLayer
                    });
                    this.staticIot.node.addDependency(this.iam);
                    this.staticIot.node.addDependency(this.cognito);
                    this.staticIot.node.addDependency(this.lambdaLayer);
                    // We output the values that need to be saved for later phases in deployment
                    // they are saved in the output JSON file
                    //
                    common_1.Common.output(this, "iotThingPrefix", prefix, "IOT Thing Name Prefix");
                    common_1.Common.output(this, "iotThingUuidSuffix", uuid, "IOT Thing UUID Suffix");
                    common_1.Common.output(this, "iotThingEndPoint", this.staticIot.iotMonitorEndpoint, "IOT Thing Monitor Endpoint");
                    common_1.Common.output(this, "iotCertKeyName", this.staticIot.iotCertKeyName, "IOT Thing Cert Keyname");
                    common_1.Common.output(this, "iotPrivateKeyName", this.staticIot.iotPrivateKeyName, "IOT Thing Private Keyname");
                    common_1.Common.output(this, "iotMonitorPolicyName", this.staticIot.iotMonitorPolicyName, "IOT Monitor Policy Name");
                }
                //////////////////////////////////////////////////////////////////////
                // Timestream
                // This will create the Timestream database, used by IOT rules to route
                // IOT messages into it.
                //
                if (CREATE_TIMESTREAM) {
                    console.log("- Processing TIMESTREAM");
                    this.timestream = new cdk_timestream_1.CDKTimestream(this, "timestream", {
                        tags: tags,
                        prefix: prefix,
                        uuid: uuid,
                        stage: stage
                    });
                    common_1.Common.output(this, "timestreamDatabase", this.timestream.databaseName, "Timestream IOT Database Name");
                    common_1.Common.output(this, "timestreamIOTTable", this.timestream.tableName, "Timestream IOT Table Name");
                    this.createBoolParam("with_timestream", true, "Feature: with Timestream");
                    this.createBoolParam("with_grafana", true, "Feature: with Grafana");
                }
                else {
                    this.createBoolParam("with_timestream", false, "Feature: with Timestream");
                    this.createBoolParam("with_grafana", false, "Feature: with grafana");
                }
                //////////////////////////////////////////////////////////////////////
                // Lambdas.
                //
                // Here we get all the params we need to pass on to the lambdas that
                // need to be created. Params are loaded into the lambdas as
                // environment variables. Other option is to get them out of the SSM
                // parameter store.
                // NOTE NOTE NOTE: there is a cross-dependency between Lambdas and IOT rules.
                // IOT rules need to point to lambdas to be invoked, and lambdas need to
                // have a reference to the IOT endpoint that they need to access.
                // This needs to be fixed.
                // NOTE2: The cross-dependency happens when a lambda needs to access IOT
                // directly, then the IOT endpoint needs to be created first and then
                // passed on to lambda so it knows where to post the message.
                //
                // However, if a lambda is set up as a target of an IOT rule, we have to
                // go the other way round, meaning the lambda has to be created first,
                // then the IOT rule created pointing at the lambda.
                //
                // Ordinarily, we would break the process into multiple steps, with the first
                // batch of lambdas getting created, then the IOT rules that need the lambdas,
                // then the IOT rules that don't, and then the lambdas that need to point at
                // the IOT endpoint.
                //
                // A bigger problem is when a lambda is invoked as part of an IOT rule, and
                // that needs to post a message to a different IOT endpoint. In that case
                // we need to either unwind the whole process OR modify the lambda AFTER it
                // has been created.
                //
                if (CREATE_LAMBDA) {
                    console.log("- Processing LAMBDA");
                    this.lambda = new cdk_lambda_1.CDKLambda(this, "lambda", {
                        tags: tags,
                        prefix: prefix,
                        stage: stage,
                        uuid: uuid,
                        logLevel: config.log_level,
                        dbPasswordKey: config.db_password_key,
                        dynamoDB: this.dynamodb,
                        httpsPort: config.https_tcp_port,
                        layer: this.lambdaLayer,
                        lambdaTimeOutSecs: config.lambda_timeout_secs,
                        region: config.region,
                        gatewayRepublishTopics: config.gg_gateway_mqtt_republish_topics,
                        securityGroup: this.network.vpcSecurityGroup,
                        dbSecurityGroup: this.database.dbSecurityGroup,
                        cognitoUserpoolArn: this.cognito.userPool.userPoolArn,
                        staticIot: this.staticIot,
                        timestream: this.timestream,
                        vpc: this.network.vpc,
                        useSSO: config.use_sso,
                        samlMetadataFilePath: config.saml_metadata_path
                    });
                    // We create dependencies so they all have to finish before we can proceed
                    //
                    this.lambda.node.addDependency(this.lambdaLayer);
                    this.lambda.node.addDependency(this.iam);
                    this.lambda.node.addDependency(this.cognito);
                    this.lambda.node.addDependency(this.network);
                    this.lambda.node.addDependency(this.staticIot);
                    this.lambda.node.addDependency(this.dynamodb);
                    this.lambda.node.addDependency(this.database);
                    if (CREATE_TIMESTREAM) {
                        this.lambda.node.addDependency(this.timestream);
                    }
                    common_1.Common.output(this, "apiEndpoint", this.lambda.apiGw.url, "API Endpoint");
                }
                //////////////////////////////////////////////////////////////////////
                // PRE-INSTALL
                // This will run the Post-Install script, if specified.
                if (RUN_POSTINSTALL_STEP) {
                    console.log("- Postinstall Step");
                    this.postInstall = new cdk_postinstall_1.CDKPostInstall(this, "postinstall", {
                        tags: tags
                    });
                    // If you need this to run AFTER everything else
                    // make sure you add a dependency to it, like so...
                    //
                    this.postInstall.node.addDependency(this.lambda);
                    this.postInstall.node.addDependency(this.cognito);
                    this.postInstall.node.addDependency(this.database);
                    this.postInstall.node.addDependency(this.network);
                }
                common_1.Common.output(this, "uuidSuffix", uuid, "Project UUID Suffix");
                common_1.Common.output(this, "namePrefix", namePrefix, "Project name prefix");
            });
        });
        // We default to checking for location. If this parameter is set to false, we don't bother looking for it.
        //
        this.createBoolParam("with_location", true, "Feature: with location");
    }
    // These create paramters in the SSM Parameter store.
    // They can then be accessed as /simpleiot/param/??? at runtime.
    //
    createStringParam(key, value, desc) {
        new ssm.StringParameter(this, "param_" + key, {
            description: desc,
            parameterName: "/simpleiot/feature/" + key,
            stringValue: value
        });
    }
    createBoolParam(key, value, desc) {
        this.createStringParam(key, value ? "True" : "False", desc);
    }
    createNumberParam(key, value, desc) {
        this.createStringParam(key, value.toString(), desc);
    }
}
exports.IotcdkStack = IotcdkStack;
module.exports = { IotcdkStack };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW90Y2RrLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW90Y2RrLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztFQUlFOzs7QUFFRixtQ0FBbUM7QUFDbkMsMkNBQTJDO0FBRzNDLGdFQUE0RDtBQUM1RCxrRUFBOEQ7QUFDOUQsMERBQXNEO0FBQ3RELDREQUF3RDtBQUN4RCw2REFBNkQ7QUFDN0QsNERBQXdEO0FBQ3hELGdFQUE0RDtBQUM1RCxrREFBOEM7QUFDOUMsd0RBQW9EO0FBQ3BELHFEQUFxRDtBQUNyRCwwREFBc0Q7QUFDdEQsZ0RBQTRDO0FBQzVDLHlEQUF5RDtBQUN6RCx1REFBdUQ7QUFDdkQsK0JBQW9DO0FBQ3BDLGdEQUEyQztBQUMzQyxrRUFBNEQ7QUFDNUQsOERBQXdEO0FBSXhELElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUMzQixJQUFJLGlCQUFpQixHQUFHLE9BQU8sQ0FBQztBQUdoQywrRUFBK0U7QUFDL0UsbUVBQW1FO0FBQ25FLEVBQUU7QUFDRixrRUFBa0U7QUFDbEUsNkJBQTZCO0FBQzdCLCtFQUErRTtBQUMvRSwrREFBK0Q7QUFDL0Qsa0VBQWtFO0FBQ2xFLG1GQUFtRjtBQUNuRix5REFBeUQ7QUFDekQsNEZBQTRGO0FBQzVGLDJGQUEyRjtBQUMzRixjQUFjO0FBQ2QsOEJBQThCO0FBQzlCLHdHQUF3RztBQUN4RyxnREFBZ0Q7QUFDaEQsOERBQThEO0FBQzlELEVBQUU7QUFHRixNQUFNLG1CQUFtQixHQUFHLEtBQUssQ0FBQTtBQUVqQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUE7QUFDdkIsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFBO0FBQzNCLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQTtBQUMzQixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUE7QUFDNUIsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFBO0FBQzVCLE1BQU0sYUFBYSxHQUFHLElBQUks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SUFFekUsQ0FBQztJQUVELHFEQUFxRDtJQUNyRCxnRUFBZ0U7SUFDaEUsRUFBRTtJQUNGLGlCQUFpQixDQUFDLEdBQVcsRUFBRSxLQUFhLEVBQUUsSUFBWTtRQUNwRCxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLFFBQVEsR0FBRyxHQUFHLEVBQUU7WUFDMUMsV0FBVyxFQUFFLElBQUk7WUFDakIsYUFBYSxFQUFFLHFCQUFxQixHQUFHLEdBQUc7WUFDMUMsV0FBVyxFQUFFLEtBQUs7U0FDckIsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVILGVBQWUsQ0FBQyxHQUFXLEVBQUUsS0FBYyxFQUFFLElBQVk7UUFDckQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFBO0lBQy9ELENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxHQUFXLEVBQUUsS0FBYSxFQUFFLElBQVk7UUFDdEQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDdkQsQ0FBQztDQUVGO0FBOWtCRCxrQ0E4a0JDO0FBRUQsTUFBTSxDQUFDLE9BQU8sR0FBRyxFQUFFLFdBQVcsRUFBRSxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogwqkgMjAyMiBBbWF6b24gV2ViIFNlcnZpY2VzLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFNpbXBsZUlPVCBwcm9qZWN0LlxuICogQXV0aG9yOiBSYW1pbiBGaXJvb3p5ZSAoZnJhbWluQGFtYXpvbi5jb20pXG4qL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmltcG9ydCB7IENES1ByZUluc3RhbGwgfSBmcm9tICcuL2NvbnN0cnVjdHMvY2RrX3ByZWluc3RhbGwnO1xuaW1wb3J0IHsgQ0RLUG9zdEluc3RhbGwgfSBmcm9tICcuL2NvbnN0cnVjdHMvY2RrX3Bvc3RpbnN0YWxsJztcbmltcG9ydCB7IENES0NvZ25pdG8gfSBmcm9tICcuL2NvbnN0cnVjdHMvY2RrX2NvZ25pdG8nO1xuaW1wb3J0IHsgQ0RLRHluYW1vREIgfSBmcm9tICcuL2NvbnN0cnVjdHMvY2RrX2R5bmFtb2RiJztcbi8vIGltcG9ydCB7IENES0Rhc2hib2FyZCB9IGZyb20gJy4vY29uc3RydWN0cy9jZGtfZGFzaGJvYXJkJztcbmltcG9ydCB7IENES0RhdGFiYXNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Nka19kYXRhYmFzZSc7XG5pbXBvcnQgeyBDREtUaW1lc3RyZWFtIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Nka190aW1lc3RyZWFtJztcbmltcG9ydCB7IENES0lhbSB9IGZyb20gJy4vY29uc3RydWN0cy9jZGtfaWFtJztcbmltcG9ydCB7IENES0xhbWJkYSB9IGZyb20gJy4vY29uc3RydWN0cy9jZGtfbGFtYmRhJztcbi8vIGltcG9ydCB7IENES1F1ZXVlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Nka19xdWV1ZSc7XG5pbXBvcnQgeyBDREtOZXR3b3JrIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Nka19uZXR3b3JrJztcbmltcG9ydCB7IENES1MzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Nka19zMyc7XG4vLyBpbXBvcnQgeyBDREtLaW5lc2lzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Nka19raW5lc2lzJztcbi8vIGltcG9ydCB7IENES1dlYkFwcCB9IGZyb20gJy4vY29uc3RydWN0cy9jZGtfd2ViYXBwJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtDb21tb259IGZyb20gXCIuL2NvbnN0cnVjdHMvY29tbW9uXCI7XG5pbXBvcnQge0NES0xhbWJkYUxheWVyfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2Nka19sYW1iZGFsYXllclwiO1xuaW1wb3J0IHtDREtTdGF0aWNJT1R9IGZyb20gXCIuL2NvbnN0cnVjdHMvY2RrX3N0YXRpY2lvdFwiO1xuLy8gaW1wb3J0IHtkYXRhfSBmcm9tIFwiYXdzLWNkay9saWIvbG9nZ2luZ1wiO1xuaW1wb3J0IHtDb250ZXh0UHJvcHN9IGZyb20gXCIuL2NvbnN0cnVjdHMvQ29udGV4dFByb3BzXCI7XG5cbnZhciBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xudmFyIFNJTVBMRUlPVF9WRVJTSU9OID0gXCIwLjAuMVwiO1xuXG5cbi8vIFRoZSBkYXRhYmFzZSwgSU9ULCBhbmQgbGFtYmRhIHNlY3Rpb24gaGF2ZSBjcm9zcy1kZXBlbmRlbmNpZXMgb24gZWFjaCBvdGhlci5cbi8vIFRoZXkgaGF2ZSB0byBiZSBidWlsdCBpbiBtdWx0aXBsZSBzdGFnZXMgYW5kIGluIHRoZSByaWdodCBvcmRlcjpcbi8vXG4vLyAtIENyZWF0ZSBJQU0gcm9sZXMgZm9yIGxhbWJkYXMgdG8gYmUgYWJsZSB0byBhY2Nlc3MgZXZlcnl0aGluZy5cbi8vIC0gQ3JlYXRlIFZQQyBmb3IgZGF0YWJhc2UuXG4vLyAtIENyZWF0ZSB0aGUgZGF0YWJhc2UgaW5zaWRlIHRoZSBWUEMgYW5kIGJhc3Rpb24gaG9zdCBhbmQgZ2V0IHRoZSBlbmRwb2ludHMuXG4vLyAtIENyZWF0ZSB0aGUgTGFtYmRhIExheWVycyB0aGF0IHdpbGwgYmUgdXNlZCBieSBhbGwgbGFtYmRhcy5cbi8vIC0gU3RhdGljIExhbWJkYSB0byBiZSB1c2VkIGZvciBDRk4gSU9UIGNyZWF0aW9uIGFuZCBtYW5hZ2VtZW50LlxuLy8gLSBDRk4gQ3VzdG9tUmVzb3VyY2UgZm9yIGNyZWF0aW9uIG9mIHRoZSBJT1QgcmVzb3VyY2VzIChjYWxscyB0aGUgc3RhdGljIGxhbWJkYSlcbi8vIC0gR2V0dGluZyBJT1QgZW5kcG9pbnRzIGFuZCByZXNvdXJjZXMgbmVlZGVkIGZyb20gQ0ZOLlxuLy8gLSBDcmVhdGluZyBhbGwgdGhlIG90aGVyIExhbWJkYXMgYW5kIEFQSXMuIFRoZSBEQiBhbmQgSU9UIGVuZHBvaW50cyBuZWVkcyB0byBiZSBwYXNzZWQgdG9cbi8vICAgdGhlc2UgYXMgZW52aXJvbm1lbnQgdmFyaWFibGVzLiBUaGV5IGFsc28gbmVlZCB0byBiZSBpbiB0aGUgVlBDIHNvIHRoZXkgY2FuIGFjY2VzcyB0aGVcbi8vICAgZGF0YWJhc2UuXG4vLyAtIENyZWF0ZSB0aGUgVGltZXN0cmVhbSBEQi5cbi8vIC0gV2UgdXNlICAgICAgICAgICAgICAgdGhlIGxhbWJkYSBBUk5zIGFkbiBUaW1lc3RyZWFtIERCIG5hbWUgYW5kIHRhYmxlIHRvIGNyZWF0ZSBhIHNldCBvZiBJT1QgcnVsZXMuXG4vLyAtIERlZmluZSBJT1QgcnVsZXMgcG9pbnRpbmcgYXQgYWJvdmUgbGFtYmRhcy5cbi8vIC0gV3JpdGUgb3V0IGFsbCB0aGUgaXRlbXMgd2UgbmVlZCB0byB3cml0ZSBmb3IgQ0xJIHN1cHBvcnQuXG4vL1xuXG5cbmNvbnN0IFJVTl9QUkVJTlNUQUxMX1NURVAgPSBmYWxzZVxuXG5jb25zdCBDUkVBVEVfSUFNID0gdHJ1ZVxuY29uc3QgQ1JFQVRFX0NPR05JVE8gPSB0cnVlXG5jb25zdCBDUkVBVEVfTkVUV09SSyA9IHRydWVcbmNvbnN0IENSRUFURV9EQVRBQkFTRSA9IHRydWVcbmNvbnN0IENSRUFURV9EWU5BTU9EQiA9IHRydWVcbmNvbnN0IENSRUFURV9MQU1CREEgPSB0cnVlXG5jb25zdCBDUkVBVEVfTEFNQkRBTEFZRVIgPSB0cnVlXG5jb25zdCBDUkVBVEVfU1RBVElDSU9UID0gdHJ1ZVxuY29uc3QgQ1JFQVRFX1MzID0gdHJ1ZVxuY29uc3QgQ1JFQVRFX1RJTUVTVFJFQU0gPSB0cnVlXG5jb25zdCBDUkVBVEVfS0lORVNJUyA9IGZhbHNlXG5cblxuLy8gRW5hYmxlIHRoaXMgaWYgeW91IHdhbnQgdG8gaGF2ZSBhIHBvc3QtaW5zdGFsbCBjbGVhbi11cCBzdGVwIGRlZmluZWQuXG4vL1xuY29uc3QgUlVOX1BPU1RJTlNUQUxMX1NURVAgPSBmYWxzZVxuXG5jb25zdCBNQVhfREJfR0VORVJBVEVEX1BBU1NXT1JEX0xFTkdUSCA9IDE1OyAvLyBtYXggZGF0YWJhc2UgbGVuZ3RoIChpZiBub3Qgc3BlY2lmaWVkIGluIGJvb3RzdHJhcClcblxuZXhwb3J0IGNsYXNzIElvdGNka1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgLy8gcHVibGljICBjb25maWc6IHsgWyBuYW1lOiBzdHJpbmcgXTogYW55IH07XG4gIHB1YmxpYyBwcmVJbnN0YWxsOiBDREtQcmVJbnN0YWxsO1xuICBwdWJsaWMgcG9zdEluc3RhbGw6IENES1Bvc3RJbnN0YWxsO1xuICBwdWJsaWMgaWFtOiBDREtJYW07XG4gIHB1YmxpYyBkYXRhYmFzZTogQ0RLRGF0YWJhc2U7XG4gIHB1YmxpYyBkeW5hbW9kYjogQ0RLRHluYW1vREI7XG4gIHB1YmxpYyBuZXR3b3JrOiBDREtOZXR3b3JrO1xuICBwdWJsaWMgY29nbml0byA6IENES0NvZ25pdG87XG4gIHB1YmxpYyBsYW1iZGFMYXllcjogQ0RLTGFtYmRhTGF5ZXI7XG4gIHB1YmxpYyBsYW1iZGE6IENES0xhbWJkYTtcbiAgcHVibGljIHMzOiBDREtTMztcbiAgcHVibGljIHRpbWVzdHJlYW0/OiBDREtUaW1lc3RyZWFtO1xuICBwdWJsaWMgc3RhdGljSW90OiBDREtTdGF0aWNJT1Q7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gICAgICBsZXQgSU9UX0RFRkFVTFRTX0ZJTEUgPSBwcm9jZXNzLmVudltcIklPVF9ERUZBVUxUU19GSUxFXCJdID8/IFwiKipJT1RfREVGQVVMVFNfRklMRV9VTkRFRklORUQqKlwiXG4gICAgICBsZXQgSU9UX1RFQU1fUEFUSCA9IHByb2Nlc3MuZW52W1wiSU9UX1RFQU1fUEFUSFwiXSA/PyBcIioqSU9UX1RFQU1fUEFUSF9VTkRFRklORUQqKlwiXG4gICAgICBsZXQgYm9vdHN0cmFwX3BhdGggPSBwYXRoLmpvaW4oSU9UX1RFQU1fUEFUSCwgXCJib290c3RyYXAuanNvblwiKVxuICAgICAgbGV0IE1ZX0lQID0gcHJvY2Vzcy5lbnZbXCJNWV9JUFwiXSA/PyBcIioqTVlfSVBfVU5ERUZJTkVEKipcIlxuICAgICAgbGV0IFBPU1RHUkVTX0ZVTExfVkVSU0lPTiA9IHByb2Nlc3MuZW52W1wiUE9TVEdSRVNfRlVMTF9WRVJTSU9OXCJdID8/IFwiKipQT1NUR1JFU19GVUxMX1VOREVGSU5FRCoqXCJcbiAgICAgIGxldCBQT1NUR1JFU19NQUpPUl9WRVJTSU9OID0gcHJvY2Vzcy5lbnZbXCJQT1NUR1JFU19NQUpPUl9WRVJTSU9OXCJdID8/IFwiKipQT1NUR1JFU19NQUpPUl9VTkRFRklORUQqKlwiXG4gICAgICBsZXQgREFUQUJBU0VfVVNFX0FVUk9SQSA9IChwcm9jZXNzLmVudltcIkRBVEFCQVNFX1VTRV9BVVJPUkFcIl0gPT0gJ1RydWUnKSA/PyBcIioqREFUQUJBU0VfVVNFX0FVUk9SQV9VTkRFRklORUQqKlwiXG5cbiAgICAgIC8vIFRoZXNlIGFyZSBsb2FkZWQgZHluYW1pY2FsbHkgZnJvbSB0aGUgSlNPTiBmaWxlcyBjcmVhdGVkIGluIHRoZSBib290c3RyYXBcbiAgICAgIC8vIHBoYXNlIG9mIGluc3RhbGxhdGlvbi4gVGhlIGJvb3RzdHJhcCBmaWxlIGlzIGluIH4vLnNpbXBsZWlvdC97cHJvZmlsZX0gYW5kXG4gICAgICAvLyB0aGUgZGVmYXVsdHMuanNvbiBmaWxlIGlzIGluIHRoZSBpbnN0YWxsZXIgcGF0aC5cbiAgICAgIC8vXG4gICAgICBpbXBvcnQoYm9vdHN0cmFwX3BhdGgpLnRoZW4oYm9vdHN0cmFwID0+IHtcbiAgICAgICAgICBpbXBvcnQoSU9UX0RFRkFVTFRTX0ZJTEUpLnRoZW4oZGVmYXVsdHMgPT4ge1xuXG4gICAgICAgICAgICAgIC8vIFdlIG1lcmdlIHRoZW0gdG9nZXRoZXIgYW5kIHBhc3MgdGhlbSBvbi5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgbGV0IGNvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIGJvb3RzdHJhcCwgZGVmYXVsdHMpO1xuXG4gICAgICAgICAgICAgIC8vIFRoaXMgcHJlZml4IGlzIGFwcGVuZGVkIHRvIGV2ZXJ5dGhpbmcgc28gd2UgY2FuIHJ1biBkaWZmZXJlbnQgYnVpbGRzXG5cbiAgICAgICAgICAgICAgbGV0IG5hbWVQcmVmaXggPSBjb25maWcubmFtZV9wcmVmaXg7XG4gICAgICAgICAgICAgIGlmICghbmFtZVByZWZpeCB8fCBuYW1lUHJlZml4Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgbmFtZVByZWZpeCA9IFwiaW90XCJcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBsZXQgc3RhZ2UgPSBjb25maWcuc3RhZ2U7XG4gICAgICAgICAgICAgIGlmICghc3RhZ2UgfHwgc3RhZ2UubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICBzdGFnZSA9IFwiZGV2XCI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgbGV0IGxvbmdVdWlkOiBzdHJpbmcgPSB1dWlkdjQoKTtcbiAgICAgICAgICAgICAgbGV0IGxhc3RQYXJ0ID0gbG9uZ1V1aWQuc3BsaXQoJy0nKS5wb3AoKTtcbiAgICAgICAgICAgICAgbGV0IHV1aWQ6IHN0cmluZyA9IGxhc3RQYXJ0ID8gbGFzdFBhcnQgOiBcIkJBRFVVSURcIjtcblxuICAgICAgICAgICAgICBsZXQgcHJlZml4ID0gbmFtZVByZWZpeCArIFwiX1wiICsgc3RhZ2U7XG5cbiAgICAgICAgICAgICAgY29uZmlnWydzdGFnZSddID0gc3RhZ2U7XG4gICAgICAgICAgICAgIGNvbmZpZ1sndXVpZCddID0gdXVpZDtcbiAgICAgICAgICAgICAgY29uZmlnWydwcmVmaXgnXSA9IHByZWZpeDtcblxuICAgICAgICAgICAgICBsZXQgdGFncyA6IHtbbmFtZTogc3RyaW5nXTogYW55fSA9IHtcbiAgICAgICAgICAgICAgICAgIGZyYW1ld29yayA6IFwic2ltcGxlaW90OlwiICsgY29uZmlnLnNpbXBsZWlvdF92ZXJzaW9uLFxuICAgICAgICAgICAgICAgICAgaW5zdGFsbF90ZWFtOiBjb25maWcudGVhbSxcbiAgICAgICAgICAgICAgICAgIHN0YWdlOiBzdGFnZSxcbiAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWRcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHRoaXMuY3JlYXRlU3RyaW5nUGFyYW0oXCJzaW1wbGVpb3RfdmVyc2lvblwiLCBjb25maWcuc2ltcGxlaW90X3ZlcnNpb24sIFwiU2ltcGxlSU9UIFZlcnNpb25cIik7XG5cbiAgICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAvLyBQUkUtSU5TVEFMTFxuICAgICAgICAgICAgICAvLyBUaGlzIHdpbGwgcnVuIHRoZSBQcmUtSW5zdGFsbCBzY3JpcHQsIGlmIHNwZWNpZmllZC5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKFJVTl9QUkVJTlNUQUxMX1NURVApIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLSBQcmVpbnN0YWxsIFN0ZXBcIik7XG4gICAgICAgICAgICAgICAgICB0aGlzLnByZUluc3RhbGwgPSBuZXcgQ0RLUHJlSW5zdGFsbCh0aGlzLCBcInByZWluc3RhbGxcIiwge1xuICAgICAgICAgICAgICAgICAgICAgIHRhZ3M6IHRhZ3NcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAvLyBJQU1cbiAgICAgICAgICAgICAgLy8gVGhpcyB3aWxsIGNyZWF0ZSB0aGUgSUFNIHJvbGVzIG5lZWRlZCBieSBJT1QgYW5kIExhbWJkYS5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKENSRUFURV9JQU0pIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLSBQcm9jZXNzaW5nIElBTVwiKVxuICAgICAgICAgICAgICAgICAgdGhpcy5pYW0gPSBuZXcgQ0RLSWFtKHRoaXMsIFwiaWFtXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgICAgICAgICAgIHByZWZpeDogcHJlZml4LFxuICAgICAgICAgICAgICAgICAgICAgIHN0YWdlOiBzdGFnZSxcbiAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkXG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAvLyBDb2duaXRvLi9cbiAgICAgICAgICAgICAgLy8gVGhpcyBjcmVhdGVzIHRoZSBDb2duaXRvIFVzZXIgUG9vbCBhbmQgSWRlbnRpdHkgbmVlZGVkIGJ5IGRhc2hib2FyZFxuICAgICAgICAgICAgICAvLyBhbmQgQVBJcyB0byBhY2Nlc3MgSU9ULiBJbiB0aGUgZnVsbCByZWxlYXNlIHRoaXMgd291bGQgYmUgcmVzdHJpY3RlZCB0b1xuICAgICAgICAgICAgICAvLyB0aG9zZSB3aXRoIHByb3BlciBhY2Nlc3MuIFRoZSBjbGllbnQgSUQgd2lsbCB0aGVuIG5lZWQgdG8gYmUgcGFzc2VkXG4gICAgICAgICAgICAgIC8vIHRvIHRoZSBkYXNoYm9hcmQgc28gaXQgY2FuIHVwZGF0ZSBpdHMgY29uZmlnIHNldHRpbmdzLlxuICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICBpZiAoQ1JFQVRFX0NPR05JVE8pIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLSBQcm9jZXNzaW5nIENPR05JVE9cIilcbiAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0byA9IG5ldyBDREtDb2duaXRvKHRoaXMsIFwiY29nbml0b1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgICAgICAgICAgICB1c2VTU086IGNvbmZpZy51c2Vfc3NvLFxuICAgICAgICAgICAgICAgICAgICAgIHByZWZpeDogcHJlZml4LFxuICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWRcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICB0aGlzLmNvZ25pdG8ubm9kZS5hZGREZXBlbmRlbmN5KHRoaXMuaWFtKVxuXG5cbiAgICAgICAgICAgICAgICAgIC8vIENvZ25pdG8gT3V0cHV0c1xuICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgIC8vIFdlIG91dHB1dCB0aGUgdmFsdWVzIHRoYXQgbmVlZCB0byBiZSBzYXZlZCBmb3IgbGF0ZXIgcGhhc2VzIGluIGRlcGxveW1lbnRcbiAgICAgICAgICAgICAgICAgIC8vIHRoZXkgYXJlIHNhdmVkIGluIHRoZSBvdXRwdXQgSlNPTiBmaWxlLlxuICAgICAgICAgICAgICAgICAgLy8gTk9URTogSWYgd2UncmUgaW4gU1NPIG1vZGUsIHdlIHdvbid0IGJlIGNyZWF0aW5nIENvZ25pdG8gdXNlciBwb29scyBzbyB3ZSBjYW4gc2tpcCB0aGVzZS5cbiAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICBpZiAoIWNvbmZpZy51c2Vfc3NvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImNvZ25pdG9TaWduaW5VcmxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2duaXRvLnNpZ25JblVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXCJDb2duaXRvIFNpZ24tSW4gVVJMXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiY29nbml0b1NpZ25pbkRvbWFpblVybFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZ25pdG8uZG9tYWluLmJhc2VVcmwoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXCJDb2duaXRvIFNpZ24tSW4gRG9tYWluIFVybFwiKVxuXG4gICAgICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImNvZ25pdG9TaWduaW5Eb21haW5OYW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by5kb21haW4uZG9tYWluTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXCJDb2duaXRvIFNpZ24tSW4gRG9tYWluIE5hbWVcIilcblxuICAgICAgICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJjb2duaXRvVXNlclBvb2xOYW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by51c2VyUG9vbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiQ29nbml0byBVc2VyIFBvb2wgTmFtZVwiKVxuXG4gICAgICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImNvZ25pdG9Vc2VyUG9vbElkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBcIkNvZ25pdG8gVXNlciBQb29sIElEXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiY29nbml0b1VzZXJQb29sQXJuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by51c2VyUG9vbC51c2VyUG9vbEFybixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgXCJDb2duaXRvIFVzZXIgUG9vbCBBcm5cIilcbiAgICAgICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiY29nbml0b0NsaWVudElkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBcIkNvZ25pdG8gQ2xpZW50IElEXCIpXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAvLyBOZWVkIHRvIG91dHB1dCB0aGVzZSBzbyB0aGV5IGNhbiBiZSBhZGRlZCB0byB0aGUgY29uZmlndXJhdGlvbiBmaWxlc1xuICAgICAgICAgICAgICAgICAgLy8gYW5kIHVzZWQgZHVyaW5nIHByb3Zpc2lvbmluZyBvZiBnYXRld2F5cy5cbiAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiY29nbml0b0lkZW50aXR5UG9vbE5hbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZ25pdG8uaWRlbnRpdHlQb29sTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBcIkNvZ25pdG8gSWRlbnRpdHkgUG9vbCBOYW1lXCIpXG5cbiAgICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJjb2duaXRvSWRlbnRpdHlQb29sSWRcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZ25pdG8uaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICAgICAgICAgICAgICBcIkNvZ25pdG8gSWRlbnRpdHkgUG9vbCBJRFwiKVxuXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiY29nbml0b0F1dGhSb2xlTmFtZVwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by5hdXRoUm9sZS5yb2xlTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBcIkNvZ25pdG8gQXV0aGVudGljYXRlZCBSb2xlIE5hbWVcIilcblxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImNvZ25pdG9BdXRoUm9sZUFSTlwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29nbml0by5hdXRoUm9sZS5yb2xlQXJuLFxuICAgICAgICAgICAgICAgICAgICAgIFwiQ29nbml0byBBdXRoZW50aWNhdGVkIFJvbGUgQVJOXCIpXG5cbiAgICAgICAgICAgICAgICAgIHRoaXMuY3JlYXRlQm9vbFBhcmFtKFwid2l0aF9jb2duaXRvXCIsIHRydWUsIFwiRmVhdHVyZTogd2l0aCBDb2duaXRvXCIpXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLmNyZWF0ZUJvb2xQYXJhbShcIndpdGhfY29nbml0b1wiLCBmYWxzZSwgXCJGZWF0dXJlOiB3aXRoIENvZ25pdG9cIilcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgLy8gUzMuXG4gICAgICAgICAgICAgIC8vIEJ1Y2tldHMgZm9yIGFjY2VzcyB0byBzdGF0aWMgbWVkaWEuXG4gICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgIGlmIChDUkVBVEVfUzMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLSBQcm9jZXNzaW5nIFMzXCIpXG4gICAgICAgICAgICAgICAgICBsZXQgc3RhdGljUm9vdCA9IFwiLi9zdGF0aWNcIjtcblxuICAgICAgICAgICAgICAgICAgdGhpcy5zMyA9IG5ldyBDREtTMyh0aGlzLCBcInMzXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgICAgICAgICAgIHByZWZpeDogcHJlZml4LFxuICAgICAgICAgICAgICAgICAgICAgIHN0YWdlOiBzdGFnZSxcbiAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgIHMzVXBsb2FkUm9vdDogc3RhdGljUm9vdFxuICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgIC8vIFdlIG91dHB1dCB0aGUgdmFsdWVzIHRoYXQgbmVlZCB0byBiZSBzYXZlZCBmb3IgbGF0ZXIgcGhhc2VzIGluIGRlcGxveW1lbnRcbiAgICAgICAgICAgICAgICAgIC8vIHRoZXkgYXJlIHNhdmVkIGluIHRoZSBvdXRwdXQgSlNPTiBmaWxlXG4gICAgICAgICAgICAgICAgICAvL1xuXG4gICAgICAgICAgICAgICAgICAvLyBGaXJtd2FyZSBVcGRhdGUgYnVja2V0IGFuZCBDbG91ZEZyb250IGRpc3RyaWJ1dGlvblxuICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJmd1VwZGF0ZUJ1Y2tldE5hbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLmZ3VXBkYXRlQnVja2V0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBcIkZXIFVwZGF0ZSBCdWNrZXQgTmFtZVwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImZ3VXBkYXRlQnVja2V0QXJuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5zMy5md1VwZGF0ZUJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgICAgICAgICAgICAgICAgXCJGVyBVcGRhdGUgQnVja2V0IEFSTlwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImZ3VXBkYXRlQ0ZEaXN0cmlidXRpb25JZFwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuczMuZndVcGRhdGVDRkRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcbiAgICAgICAgICAgICAgICAgICAgICBcIkZpcm13YXJlIFVwZGF0ZSBDbG91ZGZyb250IERpc3RyaWJ1dGlvbiBJRFwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImZ3VXBkYXRlRG93bmxvYWREb21haW5cIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLmZ3VXBkYXRlQ0ZEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBcIkZpcm13YXJlIFVwZGF0ZSBDbG91ZGZyb250IERvbWFpbiBOYW1lXCIpXG5cbiAgICAgICAgICAgICAgICAgIC8vIENvZGUgVGVtcGxhdGUgYnVja2V0IChub3QgYWNjZXNzZWQgZXh0ZXJuYWxseSlcbiAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwidGVtcGxhdGVCdWNrZXROYW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5zMy50ZW1wbGF0ZUJ1Y2tldE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgXCJUZW1wbGF0ZSBCdWNrZXQgTmFtZVwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcInRlbXBsYXRlQnVja2V0QXJuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5zMy50ZW1wbGF0ZUJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgICAgICAgICAgICAgICAgXCJUZW1wbGF0ZSBCdWNrZXQgQXJuXCIpXG5cbiAgICAgICAgICAgICAgICAgIC8vIFR3aW4gbWVkaWEgdXBsb2FkcyAoR0xCL1VTRFovSERSIGZpbGVzIGZvciBtb2RlbHMpXG4gICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcInR3aW5NZWRpYUJ1Y2tldE5hbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLnR3aW5NZWRpYUJ1Y2tldE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgXCJUd2luIE1lZGlhIEJ1Y2tldCBOYW1lXCIpXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwidHdpbk1lZGlhQnVja2V0QXJuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5zMy50d2luTWVkaWFCdWNrZXQuYnVja2V0QXJuLFxuICAgICAgICAgICAgICAgICAgICAgIFwiVHdpbiBNZWRpYSBCdWNrZXQgQXJuXCIpXG5cbiAgICAgICAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgZGlyZWN0IGFjY2VzcyB0byB0aGUgUzMgYnVja2V0LiBBbGwgR0VUcyBoYXZlIHRvXG4gICAgICAgICAgICAgICAgICAvLyBnbyB0aHJvdWdoIENsb3VkRnJvbnQuXG4gICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcInR3aW5NZWRpYUJ1Y2tldFVybFwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuczMudHdpbk1lZGlhQnVja2V0LnVybEZvck9iamVjdChcIlwiKSxcbiAgICAgICAgICAgICAgICAgICAgICBcIlR3aW4gTWVkaWEgQnVja2V0IFVybFwiKVxuXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwidHdpbk1lZGlhQ0ZEaXN0cmlidXRpb25JZFwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuczMudHdpbk1lZGlhQ0ZEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICAgICAgICAgICAgICAgICAgXCJUd2luIE1lZGlhIENsb3VkZnJvbnQgRGlzdHJpYnV0aW9uIElEXCIpXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwidHdpbk1lZGlhRG9tYWluXCIsXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5zMy50d2luTWVkaWFDRkRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIFwiVHdpbiBNZWRpYSBDbG91ZGZyb250IERvbWFpbiBOYW1lXCIpXG5cbiAgICAgICAgICAgICAgICAgIC8vIENvZGUgR2VuZXJhdG9yIGJ1bmRsZXMgYnVja2V0IChub3QgYWNjZXNzZWQgZXh0ZXJuYWxseSlcbiAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiZ2VuZXJhdG9yQnVja2V0TmFtZVwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuczMuZ2VuZXJhdG9yQnVja2V0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBcIkdlbmVyYXRvciBCdWNrZXQgTmFtZVwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImdlbmVyYXRvckJ1Y2tldEFyblwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuczMuZ2VuZXJhdG9yQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgICAgICAgICAgICAgICBcIkdlbmVyYXRvciBCdWNrZXQgQXJuXCIpXG5cbiAgICAgICAgICAgICAgICAgIC8vIFdlYiBkYXNoYm9hcmQgYnVja2V0XG4gICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImRhc2hib2FyZEJ1Y2tldE5hbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLmRhc2hib2FyZEJ1Y2tldE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgXCJEYXNoYm9hcmQgQnVja2V0IE5hbWVcIilcbiAgICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJkYXNoYm9hcmRCdWNrZXRBcm5cIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLmRhc2hib2FyZEJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgICAgICAgICAgICAgICAgXCJEYXNoYm9hcmQgQnVja2V0IEFyblwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImRhc2hib2FyZENGRGlzdHJpYnV0aW9uSWRcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLmRhc2hib2FyZENGRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkLFxuICAgICAgICAgICAgICAgICAgICAgIFwiRGFzaGJvYXJkIENsb3VkZnJvbnQgRGlzdHJpYnV0aW9uIElEXCIpXG5cbiAgICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgdGhlIGJpZyBvbmUuIFlvdSBnbyBoZXJlIHRvIGxvZ2luIHRvIHRoZSB3ZWIgZGFzaGJvYXJkLlxuICAgICAgICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHRoaXMgaXMganVzdCB0aGUgZG9tYWluIG5hbWUsIHlvdSBoYXZlIHRvIGFkZCB0aGUgXCJodHRwczovL1wiXG4gICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImRhc2hib2FyZERvbWFpbk5hbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnMzLmRhc2hib2FyZENGRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgXCJEYXNoYm9hcmQgV2Vic2l0ZSBEb21haW5cIilcbiAgICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAvLyBOZXR3b3JrL1ZQQ1xuICAgICAgICAgICAgICAvLyBUaGlzIHdpbGwgY3JlYXRlIHRoZSBuZXR3b3JraW5nIGxheWVyIG5lZWRlZCBieSBvdGhlciBjb21wb25lbnRzLlxuICAgICAgICAgICAgICAvLyBUaGlzIGlzIHByaW1hcmlseSB0aGUgY3VzdG9tIFZQLlxuICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAvLyBOT1RFOiBmb3IgdGVzdGluZywgeW91IGNhbiBzcGVjaWZ5IGFuIGV4aXN0aW5nIFZQQyBhbmQgU2VjdXJpdHkgR3JvdXBcbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKENSRUFURV9ORVRXT1JLKSB7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIi0gUHJvY2Vzc2luZyBORVRXT1JLL1ZQQ1wiKVxuICAgICAgICAgICAgICAgICAgdGhpcy5uZXR3b3JrID0gbmV3IENES05ldHdvcmsodGhpcywgXCJuZXR3b3JrXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgICAgICAgICAgIHByZWZpeDogcHJlZml4LFxuICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgc3RhZ2U6IHN0YWdlXG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgdGhpcy5uZXR3b3JrLm5vZGUuYWRkRGVwZW5kZW5jeSh0aGlzLmlhbSlcblxuICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAgIC8vLyBEeW5hbW9EQlxuICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAvLyBUaGUgcmF3IGRhdGEgcmVjZWl2ZWQgdmlhIGJvdGggSU9UIGFuZCBSRVNUIEFQSXMgYXJlIHNhdmVkIGluIER5bmFtb0RCLlxuICAgICAgICAgICAgICAvLyBUaGlzIGNhbiBiZSB1c2VkIHRvIHJ1biBhbmFseXRpY3MuXG4gICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgIC8vIFRoZSB2YWx1ZXMgYXJlIHNlbnQgYnkgdGhlIGxhbWJkYXMgcmVjZWl2aW5nIHRoZSBTRVQgZGF0YS5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKENSRUFURV9EWU5BTU9EQikge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCItIFByb2Nlc3NpbmcgRFlOQU1PREJcIilcbiAgICAgICAgICAgICAgICAgIHRoaXMuZHluYW1vZGIgPSBuZXcgQ0RLRHluYW1vREIodGhpcywgIFwiZHluYW1vZGJcIiwge1xuICAgICAgICAgICAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgcHJlZml4OiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICB2cGM6IHRoaXMubmV0d29yay52cGMsXG4gICAgICAgICAgICAgICAgICAgICAgdGFibGVOYW1lOiBcImR5bmFtb190YWJsZVwiXG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgdGhpcy5keW5hbW9kYi5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5uZXR3b3JrKVxuXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiZHluYW1vREJUYWJsZVwiLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZHluYW1vZGIuZHluYW1vREJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgXCJEeW5hbW9EQiB0YWJsZSBuYW1lXCIpXG5cbiAgICAgICAgICAgICAgICAgIHRoaXMuY3JlYXRlQm9vbFBhcmFtKFwid2l0aF9keW5hbW9kYlwiLCB0cnVlLCBcIkZlYXR1cmU6IHdpdGggRHluYW1vREJcIilcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMuY3JlYXRlQm9vbFBhcmFtKFwid2l0aF9keW5hbW9kYlwiLCBmYWxzZSwgXCJGZWF0dXJlOiB3aXRoIER5bmFtb0RCXCIpXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAgIC8vIFJEUyBkYXRhYmFzZXMuXG4gICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgIC8vIFRoaXMgd2lsbCBjcmVhdGUgYW4gUkRTIGluc3RhbmNlIGluc2lkZSBhIFZQQyBhbmQgYVxuICAgICAgICAgICAgICAvLyBiYXN0aW9uIGhvc3QgdGhhdCBjYW4gYmUgdXNlZCB0byBTU0ggcmVtb3RlbHkgaW50byBpdC4gVGhlIFNTSFxuICAgICAgICAgICAgICAvLyBpcyBuZWVkZWQgaWYgeW91IHdhbnQgdG8gdXNlIHRoZSBEQiBpbmdlc3RlciBsb2FkZXJzIGZyb20gYSBkZXNrdG9wXG4gICAgICAgICAgICAgIC8vICh1c2VmdWwgZm9yIGRldmVsb3BtZW50KSBvciBhbnkgb3RoZXIgaG9zdCB3aXRob3V0IGRpcmVjdCBhY2Nlc3MgdG9cbiAgICAgICAgICAgICAgLy8gdGhlIFZQQy5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgLy8gTk9URSB0aGF0IHRoZSBFQzIgU1NIIGtleXBhaXIgbXVzdCBiZSBjcmVhdGVkIG1hbnVhbGx5XG4gICAgICAgICAgICAgIC8vIGluc2lkZSB0aGUgYWNjb3VudCBhbmQgdGhlIG5hbWUgaXMgcGFzc2VkIHRvIHRoaXMgZnVuY3Rpb24uXG4gICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgIC8vIE5PVEU6IGZvciBhIGRldmVsb3BtZW50IHN5c3RlbSwgd2UncmUgZ29pbmcgdG8gdXNlIGEgc21hbGwgUkRTIFBvc3RncmVzIGluc3RhbmNlLlxuICAgICAgICAgICAgICAvLyBGb3IgYSBwcm9kdWN0aW9uIHN5c3RlbSwgeW91IHdpbGwgd2FudCB0byBzd2l0Y2ggdG8gYSBzY2FsYWJsZSBBdXJvcmFQb3N0Z3JlcyB2ZXJzaW9uLlxuICAgICAgICAgICAgICAvLyBFeGFtcGxlIG9mIGNyZWF0aW5nIHRoaXMgaXMgaW4gdGhlIENES0RhdGFiYXNlIHNvdXJjZSwgY29tbWVudGVkIG91dC4gSG93ZXZlciwgYmUgYXdhcmUgdGhhdFxuICAgICAgICAgICAgICAvLyBBdXJvcmEgZG9lcyBub3QgaGF2ZSBhIGZyZWUgdGllci5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgLy8gSW4gaW90Y2RrL3Rhc2tzLnB5LCB5b3Ugd2lsbCBhbHNvIG5lZWQgdG8gaW5kaWNhdGUgdGhhdCB5b3UncmUgdXNpbmdcblxuICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICBpZiAoQ1JFQVRFX0RBVEFCQVNFKSB7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIi0gUHJvY2Vzc2luZyBEQVRBQkFTRS9SRFNcIilcbiAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YWJhc2UgPSBuZXcgQ0RLRGF0YWJhc2UodGhpcywgXCJkYlwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgICAgICAgICAgICBwcmVmaXg6IHByZWZpeCxcbiAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgIHZwYzogdGhpcy5uZXR3b3JrLnZwYyxcbiAgICAgICAgICAgICAgICAgICAgICB1c2VBdXJvcmE6IERBVEFCQVNFX1VTRV9BVVJPUkEsXG4gICAgICAgICAgICAgICAgICAgICAgbXlJcDogTVlfSVAsXG4gICAgICAgICAgICAgICAgICAgICAgcG9zdGdyZXNGdWxsVmVyc2lvbjogUE9TVEdSRVNfRlVMTF9WRVJTSU9OLFxuICAgICAgICAgICAgICAgICAgICAgIHBvc3RncmVzTWFqb3JWZXJzaW9uOiBQT1NUR1JFU19NQUpPUl9WRVJTSU9OLFxuICAgICAgICAgICAgICAgICAgICAgIGRiUG9ydDogY29uZmlnLmRhdGFiYXNlX3RjcF9wb3J0LFxuICAgICAgICAgICAgICAgICAgICAgIGh0dHBzUG9ydDogY29uZmlnLmh0dHBzX3RjcF9wb3J0LFxuICAgICAgICAgICAgICAgICAgICAgIGRiVXNlcm5hbWU6IGNvbmZpZy5kYl91c2VybmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBkYlBhc3N3b3JkS2V5OiBjb25maWcuZGJfcGFzc3dvcmRfa2V5LFxuICAgICAgICAgICAgICAgICAgICAgIGFsbG9jYXRlZFN0b3JhZ2U6IGNvbmZpZy5kYl9zdG9yYWdlX3NpemVfZ2IsXG4gICAgICAgICAgICAgICAgICAgICAgbWF4QWxsb2NhdGVkU3RvcmFnZTogY29uZmlnLmRiX21heF9zdG9yYWdlX3NpemVfZ2IsXG4gICAgICAgICAgICAgICAgICAgICAgZGJOYW1lOiBjb25maWcuZGJfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXlwYWlyTmFtZTogY29uZmlnLmJhc3Rpb25fc3NoX2VjMl9rZXlwYWlyX25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgbWF4R2VuZXJhdGVkUGFzc3dvcmRMZW5ndGg6IE1BWF9EQl9HRU5FUkFURURfUEFTU1dPUkRfTEVOR1RIXG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgdGhpcy5kYXRhYmFzZS5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5uZXR3b3JrKVxuXG4gICAgICAgICAgICAgICAgICAvLyBXZSBvdXRwdXQgdGhlIHZhbHVlcyB0aGF0IG5lZWQgdG8gYmUgc2F2ZWQgZm9yIGxhdGVyIHBoYXNlcyBpbiBkZXBsb3ltZW50XG4gICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgb3V0cHV0IEpTT04gZmlsZSwgd2hpY2ggd2lsbCB0aGVuIGJlIGxvYWRlZCBpbnRvIGNvbmZpZyBmaWxlcy5cbiAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiYmFzdGlvbkhvc3RTU0hEbnNcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFiYXNlLmJhc3Rpb24uaW5zdGFuY2VQdWJsaWNEbnNOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIFwiQmFzdGlvbiBIb3N0IFNTSCBETlNcIilcblxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImJhc3Rpb25Ib3N0U1NISXBcIixcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFiYXNlLmJhc3Rpb24uaW5zdGFuY2VQdWJsaWNJcCxcbiAgICAgICAgICAgICAgICAgICAgICBcIkJhc3Rpb24gSG9zdCBTU0ggSVBcIilcblxuICAgICAgICAgICAgICAgICAgLy8gQ0RLRGF0YWJhc2UgdW5pZmllcyB0aGUgaG9zdG5hbWUsIHdoZXRoZXIgaXQncyBBdXJvcmEgQ2x1c3RlciBvciBTaW5nbGUgUkRTIGluc3RhbmNlLlxuICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJkYkhvc3RuYW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5kYXRhYmFzZS5kYXRhYmFzZUhvc3RuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgIFwiRGF0YWJhc2UgZW5kcG9pbnQgaG9zdG5hbWVcIilcblxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImJhc3Rpb25TU0hBbGxvd2VkSVBcIixcbiAgICAgICAgICAgICAgICAgICAgICBNWV9JUCxcbiAgICAgICAgICAgICAgICAgICAgICBcIklQIGFkZHJlc3Mgd2l0aCBTU0ggYWNjZXNzIHRvIGJhc3Rpb24gaG9zdFwiKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAvLyBMQU1CREFMQVlFUlxuICAgICAgICAgICAgICAvLyBUaGlzIHdpbGwgY3JlYXRlIHRoZSBsYXllcnMgdXNlZCBieSBhbGwgbGFtYmRhcy5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKENSRUFURV9MQU1CREFMQVlFUikge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCItIFByb2Nlc3NpbmcgTEFNQkRBIExBWUVSXCIpXG4gICAgICAgICAgICAgICAgICB0aGlzLmxhbWJkYUxheWVyID0gbmV3IENES0xhbWJkYUxheWVyKHRoaXMsIFwibGFtYmRhbGF5ZXJcIiwge1xuICAgICAgICAgICAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgcHJlZml4OiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICBzdGFnZTogc3RhZ2VcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAgIC8vIElPVCBTdGF0aWMgQ29tcG9uZW50cyAoZm9yIHVzZSBkdXJpbmcgc2V0IHVwIGFuZCBkZWxldGlvbilcbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKENSRUFURV9TVEFUSUNJT1QpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLSBQcm9jZXNzaW5nIElPVCBJTklUSUFMSVpFUiBGT1IgQ0RLXCIpXG4gICAgICAgICAgICAgICAgICB0aGlzLnN0YXRpY0lvdCA9IG5ldyBDREtTdGF0aWNJT1QodGhpcywgXCJzdGF0aWNpb3RcIiwge1xuICAgICAgICAgICAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgcHJlZml4OiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgICAgc3RhZ2U6IHN0YWdlLFxuICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IGNvbmZpZy5sb2dfbGV2ZWwsXG4gICAgICAgICAgICAgICAgICAgICAgdnBjOiB0aGlzLm5ldHdvcmsudnBjLFxuICAgICAgICAgICAgICAgICAgICAgIGlhbTogdGhpcy5pYW0sXG4gICAgICAgICAgICAgICAgICAgICAgbGF5ZXI6IHRoaXMubGFtYmRhTGF5ZXJcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICB0aGlzLnN0YXRpY0lvdC5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5pYW0pXG4gICAgICAgICAgICAgICAgICB0aGlzLnN0YXRpY0lvdC5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5jb2duaXRvKVxuICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0aWNJb3Qubm9kZS5hZGREZXBlbmRlbmN5KHRoaXMubGFtYmRhTGF5ZXIpXG5cbiAgICAgICAgICAgICAgICAvLyBXZSBvdXRwdXQgdGhlIHZhbHVlcyB0aGF0IG5lZWQgdG8gYmUgc2F2ZWQgZm9yIGxhdGVyIHBoYXNlcyBpbiBkZXBsb3ltZW50XG4gICAgICAgICAgICAgICAgLy8gdGhleSBhcmUgc2F2ZWQgaW4gdGhlIG91dHB1dCBKU09OIGZpbGVcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJpb3RUaGluZ1ByZWZpeFwiLFxuICAgICAgICAgICAgICAgICAgICBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgIFwiSU9UIFRoaW5nIE5hbWUgUHJlZml4XCIpXG4gICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImlvdFRoaW5nVXVpZFN1ZmZpeFwiLFxuICAgICAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBcIklPVCBUaGluZyBVVUlEIFN1ZmZpeFwiKVxuICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJpb3RUaGluZ0VuZFBvaW50XCIsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGljSW90LmlvdE1vbml0b3JFbmRwb2ludCxcbiAgICAgICAgICAgICAgICAgICAgXCJJT1QgVGhpbmcgTW9uaXRvciBFbmRwb2ludFwiKVxuICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJpb3RDZXJ0S2V5TmFtZVwiLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRpY0lvdC5pb3RDZXJ0S2V5TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgXCJJT1QgVGhpbmcgQ2VydCBLZXluYW1lXCIpXG4gICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcImlvdFByaXZhdGVLZXlOYW1lXCIsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGljSW90LmlvdFByaXZhdGVLZXlOYW1lLFxuICAgICAgICAgICAgICAgICAgICBcIklPVCBUaGluZyBQcml2YXRlIEtleW5hbWVcIilcbiAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiaW90TW9uaXRvclBvbGljeU5hbWVcIixcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0aWNJb3QuaW90TW9uaXRvclBvbGljeU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIFwiSU9UIE1vbml0b3IgUG9saWN5IE5hbWVcIilcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgLy8gVGltZXN0cmVhbVxuICAgICAgICAgICAgICAvLyBUaGlzIHdpbGwgY3JlYXRlIHRoZSBUaW1lc3RyZWFtIGRhdGFiYXNlLCB1c2VkIGJ5IElPVCBydWxlcyB0byByb3V0ZVxuICAgICAgICAgICAgICAvLyBJT1QgbWVzc2FnZXMgaW50byBpdC5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgaWYgKENSRUFURV9USU1FU1RSRUFNKSB7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIi0gUHJvY2Vzc2luZyBUSU1FU1RSRUFNXCIpXG4gICAgICAgICAgICAgICAgICB0aGlzLnRpbWVzdHJlYW0gPSBuZXcgQ0RLVGltZXN0cmVhbSh0aGlzLCBcInRpbWVzdHJlYW1cIiwge1xuICAgICAgICAgICAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgcHJlZml4OiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICBzdGFnZTogc3RhZ2VcbiAgICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJ0aW1lc3RyZWFtRGF0YWJhc2VcIixcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lc3RyZWFtLmRhdGFiYXNlTmFtZSxcbiAgICAgICAgICAgICAgICAgIFwiVGltZXN0cmVhbSBJT1QgRGF0YWJhc2UgTmFtZVwiKVxuICAgICAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcInRpbWVzdHJlYW1JT1RUYWJsZVwiLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWVzdHJlYW0udGFibGVOYW1lLFxuICAgICAgICAgICAgICAgICAgXCJUaW1lc3RyZWFtIElPVCBUYWJsZSBOYW1lXCIpXG5cbiAgICAgICAgICAgICAgICAgIHRoaXMuY3JlYXRlQm9vbFBhcmFtKFwid2l0aF90aW1lc3RyZWFtXCIsIHRydWUsIFwiRmVhdHVyZTogd2l0aCBUaW1lc3RyZWFtXCIpXG4gICAgICAgICAgICAgICAgICB0aGlzLmNyZWF0ZUJvb2xQYXJhbShcIndpdGhfZ3JhZmFuYVwiLCB0cnVlLCBcIkZlYXR1cmU6IHdpdGggR3JhZmFuYVwiKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdGhpcy5jcmVhdGVCb29sUGFyYW0oXCJ3aXRoX3RpbWVzdHJlYW1cIiwgZmFsc2UsIFwiRmVhdHVyZTogd2l0aCBUaW1lc3RyZWFtXCIpXG4gICAgICAgICAgICAgICAgICB0aGlzLmNyZWF0ZUJvb2xQYXJhbShcIndpdGhfZ3JhZmFuYVwiLCBmYWxzZSwgXCJGZWF0dXJlOiB3aXRoIGdyYWZhbmFcIilcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgLy8gTGFtYmRhcy5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgLy8gSGVyZSB3ZSBnZXQgYWxsIHRoZSBwYXJhbXMgd2UgbmVlZCB0byBwYXNzIG9uIHRvIHRoZSBsYW1iZGFzIHRoYXRcbiAgICAgICAgICAgICAgLy8gbmVlZCB0byBiZSBjcmVhdGVkLiBQYXJhbXMgYXJlIGxvYWRlZCBpbnRvIHRoZSBsYW1iZGFzIGFzXG4gICAgICAgICAgICAgIC8vIGVudmlyb25tZW50IHZhcmlhYmxlcy4gT3RoZXIgb3B0aW9uIGlzIHRvIGdldCB0aGVtIG91dCBvZiB0aGUgU1NNXG4gICAgICAgICAgICAgIC8vIHBhcmFtZXRlciBzdG9yZS5cblxuICAgICAgICAgICAgICAvLyBOT1RFIE5PVEUgTk9URTogdGhlcmUgaXMgYSBjcm9zcy1kZXBlbmRlbmN5IGJldHdlZW4gTGFtYmRhcyBhbmQgSU9UIHJ1bGVzLlxuICAgICAgICAgICAgICAvLyBJT1QgcnVsZXMgbmVlZCB0byBwb2ludCB0byBsYW1iZGFzIHRvIGJlIGludm9rZWQsIGFuZCBsYW1iZGFzIG5lZWQgdG9cbiAgICAgICAgICAgICAgLy8gaGF2ZSBhIHJlZmVyZW5jZSB0byB0aGUgSU9UIGVuZHBvaW50IHRoYXQgdGhleSBuZWVkIHRvIGFjY2Vzcy5cbiAgICAgICAgICAgICAgLy8gVGhpcyBuZWVkcyB0byBiZSBmaXhlZC5cblxuICAgICAgICAgICAgICAvLyBOT1RFMjogVGhlIGNyb3NzLWRlcGVuZGVuY3kgaGFwcGVucyB3aGVuIGEgbGFtYmRhIG5lZWRzIHRvIGFjY2VzcyBJT1RcbiAgICAgICAgICAgICAgLy8gZGlyZWN0bHksIHRoZW4gdGhlIElPVCBlbmRwb2ludCBuZWVkcyB0byBiZSBjcmVhdGVkIGZpcnN0IGFuZCB0aGVuXG4gICAgICAgICAgICAgIC8vIHBhc3NlZCBvbiB0byBsYW1iZGEgc28gaXQga25vd3Mgd2hlcmUgdG8gcG9zdCB0aGUgbWVzc2FnZS5cbiAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgLy8gSG93ZXZlciwgaWYgYSBsYW1iZGEgaXMgc2V0IHVwIGFzIGEgdGFyZ2V0IG9mIGFuIElPVCBydWxlLCB3ZSBoYXZlIHRvXG4gICAgICAgICAgICAgIC8vIGdvIHRoZSBvdGhlciB3YXkgcm91bmQsIG1lYW5pbmcgdGhlIGxhbWJkYSBoYXMgdG8gYmUgY3JlYXRlZCBmaXJzdCxcbiAgICAgICAgICAgICAgLy8gdGhlbiB0aGUgSU9UIHJ1bGUgY3JlYXRlZCBwb2ludGluZyBhdCB0aGUgbGFtYmRhLlxuICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAvLyBPcmRpbmFyaWx5LCB3ZSB3b3VsZCBicmVhayB0aGUgcHJvY2VzcyBpbnRvIG11bHRpcGxlIHN0ZXBzLCB3aXRoIHRoZSBmaXJzdFxuICAgICAgICAgICAgICAvLyBiYXRjaCBvZiBsYW1iZGFzIGdldHRpbmcgY3JlYXRlZCwgdGhlbiB0aGUgSU9UIHJ1bGVzIHRoYXQgbmVlZCB0aGUgbGFtYmRhcyxcbiAgICAgICAgICAgICAgLy8gdGhlbiB0aGUgSU9UIHJ1bGVzIHRoYXQgZG9uJ3QsIGFuZCB0aGVuIHRoZSBsYW1iZGFzIHRoYXQgbmVlZCB0byBwb2ludCBhdFxuICAgICAgICAgICAgICAvLyB0aGUgSU9UIGVuZHBvaW50LlxuICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAvLyBBIGJpZ2dlciBwcm9ibGVtIGlzIHdoZW4gYSBsYW1iZGEgaXMgaW52b2tlZCBhcyBwYXJ0IG9mIGFuIElPVCBydWxlLCBhbmRcbiAgICAgICAgICAgICAgLy8gdGhhdCBuZWVkcyB0byBwb3N0IGEgbWVzc2FnZSB0byBhIGRpZmZlcmVudCBJT1QgZW5kcG9pbnQuIEluIHRoYXQgY2FzZVxuICAgICAgICAgICAgICAvLyB3ZSBuZWVkIHRvIGVpdGhlciB1bndpbmQgdGhlIHdob2xlIHByb2Nlc3MgT1IgbW9kaWZ5IHRoZSBsYW1iZGEgQUZURVIgaXRcbiAgICAgICAgICAgICAgLy8gaGFzIGJlZW4gY3JlYXRlZC5cbiAgICAgICAgICAgICAgLy9cblxuICAgICAgICAgICAgICBpZiAoQ1JFQVRFX0xBTUJEQSkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCItIFByb2Nlc3NpbmcgTEFNQkRBXCIpXG5cbiAgICAgICAgICAgICAgICAgIHRoaXMubGFtYmRhID0gbmV3IENES0xhbWJkYSh0aGlzLFxuICAgICAgICAgICAgICAgICAgICAgIFwibGFtYmRhXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcHJlZml4OiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHN0YWdlOiBzdGFnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IGNvbmZpZy5sb2dfbGV2ZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGRiUGFzc3dvcmRLZXk6IGNvbmZpZy5kYl9wYXNzd29yZF9rZXksXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGR5bmFtb0RCOiB0aGlzLmR5bmFtb2RiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBodHRwc1BvcnQ6IGNvbmZpZy5odHRwc190Y3BfcG9ydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgbGF5ZXI6IHRoaXMubGFtYmRhTGF5ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGxhbWJkYVRpbWVPdXRTZWNzOiBjb25maWcubGFtYmRhX3RpbWVvdXRfc2VjcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnaW9uOiBjb25maWcucmVnaW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBnYXRld2F5UmVwdWJsaXNoVG9waWNzOiBjb25maWcuZ2dfZ2F0ZXdheV9tcXR0X3JlcHVibGlzaF90b3BpY3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IHRoaXMubmV0d29yay52cGNTZWN1cml0eUdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBkYlNlY3VyaXR5R3JvdXA6IHRoaXMuZGF0YWJhc2UuZGJTZWN1cml0eUdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBjb2duaXRvVXNlcnBvb2xBcm46IHRoaXMuY29nbml0by51c2VyUG9vbC51c2VyUG9vbEFybixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGljSW90OiB0aGlzLnN0YXRpY0lvdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZXN0cmVhbTogdGhpcy50aW1lc3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICAgICAgICB2cGM6IHRoaXMubmV0d29yay52cGMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHVzZVNTTzogY29uZmlnLnVzZV9zc28sXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHNhbWxNZXRhZGF0YUZpbGVQYXRoOiBjb25maWcuc2FtbF9tZXRhZGF0YV9wYXRoXG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgLy8gV2UgY3JlYXRlIGRlcGVuZGVuY2llcyBzbyB0aGV5IGFsbCBoYXZlIHRvIGZpbmlzaCBiZWZvcmUgd2UgY2FuIHByb2NlZWRcbiAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICB0aGlzLmxhbWJkYS5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5sYW1iZGFMYXllcilcbiAgICAgICAgICAgICAgICAgIHRoaXMubGFtYmRhLm5vZGUuYWRkRGVwZW5kZW5jeSh0aGlzLmlhbSlcbiAgICAgICAgICAgICAgICAgIHRoaXMubGFtYmRhLm5vZGUuYWRkRGVwZW5kZW5jeSh0aGlzLmNvZ25pdG8pXG4gICAgICAgICAgICAgICAgICB0aGlzLmxhbWJkYS5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5uZXR3b3JrKVxuICAgICAgICAgICAgICAgICAgdGhpcy5sYW1iZGEubm9kZS5hZGREZXBlbmRlbmN5KHRoaXMuc3RhdGljSW90KVxuICAgICAgICAgICAgICAgICAgdGhpcy5sYW1iZGEubm9kZS5hZGREZXBlbmRlbmN5KHRoaXMuZHluYW1vZGIpXG4gICAgICAgICAgICAgICAgICB0aGlzLmxhbWJkYS5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5kYXRhYmFzZSlcbiAgICAgICAgICAgICAgICAgIGlmIChDUkVBVEVfVElNRVNUUkVBTSkge1xuICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGFtYmRhLm5vZGUuYWRkRGVwZW5kZW5jeSh0aGlzLnRpbWVzdHJlYW0hKVxuICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICBDb21tb24ub3V0cHV0KHRoaXMsIFwiYXBpRW5kcG9pbnRcIixcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYW1iZGEuYXBpR3cudXJsLFxuICAgICAgICAgICAgICAgIFwiQVBJIEVuZHBvaW50XCIpXG5cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgLy8gUFJFLUlOU1RBTExcbiAgICAgICAgICAgICAgLy8gVGhpcyB3aWxsIHJ1biB0aGUgUG9zdC1JbnN0YWxsIHNjcmlwdCwgaWYgc3BlY2lmaWVkLlxuXG4gICAgICAgICAgICAgIGlmIChSVU5fUE9TVElOU1RBTExfU1RFUCkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCItIFBvc3RpbnN0YWxsIFN0ZXBcIik7XG4gICAgICAgICAgICAgICAgICB0aGlzLnBvc3RJbnN0YWxsID0gbmV3IENES1Bvc3RJbnN0YWxsKHRoaXMsIFwicG9zdGluc3RhbGxcIiwge1xuICAgICAgICAgICAgICAgICAgICAgIHRhZ3M6IHRhZ3NcbiAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAvLyBJZiB5b3UgbmVlZCB0aGlzIHRvIHJ1biBBRlRFUiBldmVyeXRoaW5nIGVsc2VcbiAgICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSB5b3UgYWRkIGEgZGVwZW5kZW5jeSB0byBpdCwgbGlrZSBzby4uLlxuICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgdGhpcy5wb3N0SW5zdGFsbC5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5sYW1iZGEpXG4gICAgICAgICAgICAgICAgIHRoaXMucG9zdEluc3RhbGwubm9kZS5hZGREZXBlbmRlbmN5KHRoaXMuY29nbml0bylcbiAgICAgICAgICAgICAgICAgdGhpcy5wb3N0SW5zdGFsbC5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5kYXRhYmFzZSlcbiAgICAgICAgICAgICAgICAgdGhpcy5wb3N0SW5zdGFsbC5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5uZXR3b3JrKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgQ29tbW9uLm91dHB1dCh0aGlzLCBcInV1aWRTdWZmaXhcIixcbiAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICBcIlByb2plY3QgVVVJRCBTdWZmaXhcIik7XG4gICAgICAgICAgICAgIENvbW1vbi5vdXRwdXQodGhpcywgXCJuYW1lUHJlZml4XCIsXG4gICAgICAgICAgICAgICAgICBuYW1lUHJlZml4LFxuICAgICAgICAgICAgICAgICAgXCJQcm9qZWN0IG5hbWUgcHJlZml4XCIpO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFdlIGRlZmF1bHQgdG8gY2hlY2tpbmcgZm9yIGxvY2F0aW9uLiBJZiB0aGlzIHBhcmFtZXRlciBpcyBzZXQgdG8gZmFsc2UsIHdlIGRvbid0IGJvdGhlciBsb29raW5nIGZvciBpdC5cbiAgICAgIC8vXG4gICAgICB0aGlzLmNyZWF0ZUJvb2xQYXJhbShcIndpdGhfbG9jYXRpb25cIiwgdHJ1ZSwgXCJGZWF0dXJlOiB3aXRoIGxvY2F0aW9uXCIpXG5cbiAgfVxuXG4gIC8vIFRoZXNlIGNyZWF0ZSBwYXJhbXRlcnMgaW4gdGhlIFNTTSBQYXJhbWV0ZXIgc3RvcmUuXG4gIC8vIFRoZXkgY2FuIHRoZW4gYmUgYWNjZXNzZWQgYXMgL3NpbXBsZWlvdC9wYXJhbS8/Pz8gYXQgcnVudGltZS5cbiAgLy9cbiAgY3JlYXRlU3RyaW5nUGFyYW0oa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIGRlc2M6IHN0cmluZykgOiB2b2lkIHtcbiAgICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgXCJwYXJhbV9cIiArIGtleSwge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGRlc2MsXG4gICAgICAgICAgICBwYXJhbWV0ZXJOYW1lOiBcIi9zaW1wbGVpb3QvZmVhdHVyZS9cIiArIGtleSxcbiAgICAgICAgICAgIHN0cmluZ1ZhbHVlOiB2YWx1ZVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgY3JlYXRlQm9vbFBhcmFtKGtleTogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbiwgZGVzYzogc3RyaW5nKSA6IHZvaWQge1xuICAgICAgdGhpcy5jcmVhdGVTdHJpbmdQYXJhbShrZXksIHZhbHVlID8gXCJUcnVlXCIgOiBcIkZhbHNlXCIsIGRlc2MpXG4gIH1cblxuICBjcmVhdGVOdW1iZXJQYXJhbShrZXk6IHN0cmluZywgdmFsdWU6IG51bWJlciwgZGVzYzogc3RyaW5nKSA6IHZvaWQge1xuICAgICAgdGhpcy5jcmVhdGVTdHJpbmdQYXJhbShrZXksIHZhbHVlLnRvU3RyaW5nKCksIGRlc2MpXG4gIH1cblxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgSW90Y2RrU3RhY2sgfVxuIl19