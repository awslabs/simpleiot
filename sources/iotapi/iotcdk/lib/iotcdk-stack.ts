/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/

import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { CDKPreInstall } from './constructs/cdk_preinstall';
import { CDKPostInstall } from './constructs/cdk_postinstall';
import { CDKCognito } from './constructs/cdk_cognito';
import { CDKDynamoDB } from './constructs/cdk_dynamodb';
// import { CDKDashboard } from './constructs/cdk_dashboard';
import { CDKDatabase } from './constructs/cdk_database';
import { CDKTimestream } from './constructs/cdk_timestream';
import { CDKIam } from './constructs/cdk_iam';
import { CDKLambda } from './constructs/cdk_lambda';
// import { CDKQueue } from './constructs/cdk_queue';
import { CDKNetwork } from './constructs/cdk_network';
import { CDKS3 } from './constructs/cdk_s3';
// import { CDKKinesis } from './constructs/cdk_kinesis';
// import { CDKWebApp } from './constructs/cdk_webapp';
import { v4 as uuidv4 } from 'uuid';
import {Common} from "./constructs/common";
import {CDKLambdaLayer} from "./constructs/cdk_lambdalayer";
import {CDKStaticIOT} from "./constructs/cdk_staticiot";
// import {data} from "aws-cdk/lib/logging";
import {ContextProps} from "./constructs/ContextProps";

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


const RUN_PREINSTALL_STEP = false

const CREATE_IAM = true
const CREATE_COGNITO = true
const CREATE_NETWORK = true
const CREATE_DATABASE = true
const CREATE_DYNAMODB = true
const CREATE_LAMBDA = true
const CREATE_LAMBDALAYER = true
const CREATE_STATICIOT = true
const CREATE_S3 = true
const CREATE_TIMESTREAM = true
const CREATE_KINESIS = false


// Enable this if you want to have a post-install clean-up step defined.
//
const RUN_POSTINSTALL_STEP = false

const MAX_DB_GENERATED_PASSWORD_LENGTH = 15; // max database length (if not specified in bootstrap)

export class IotcdkStack extends cdk.Stack {
  // public  config: { [ name: string ]: any };
  public preInstall: CDKPreInstall;
  public postInstall: CDKPostInstall;
  public iam: CDKIam;
  public database: CDKDatabase;
  public dynamodb: CDKDynamoDB;
  public network: CDKNetwork;
  public cognito : CDKCognito;
  public lambdaLayer: CDKLambdaLayer;
  public lambda: CDKLambda;
  public s3: CDKS3;
  public timestream?: CDKTimestream;
  public staticIot: CDKStaticIOT;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);
      let IOT_DEFAULTS_FILE = process.env["IOT_DEFAULTS_FILE"] ?? "**IOT_DEFAULTS_FILE_UNDEFINED**"
      let IOT_TEAM_PATH = process.env["IOT_TEAM_PATH"] ?? "**IOT_TEAM_PATH_UNDEFINED**"
      let bootstrap_path = path.join(IOT_TEAM_PATH, "bootstrap.json")
      let MY_IP = process.env["MY_IP"] ?? "**MY_IP_UNDEFINED**"
      let POSTGRES_FULL_VERSION = process.env["POSTGRES_FULL_VERSION"] ?? "**POSTGRES_FULL_UNDEFINED**"
      let POSTGRES_MAJOR_VERSION = process.env["POSTGRES_MAJOR_VERSION"] ?? "**POSTGRES_MAJOR_UNDEFINED**"
      let DATABASE_USE_AURORA = (process.env["DATABASE_USE_AURORA"] == 'True') ?? "**DATABASE_USE_AURORA_UNDEFINED**"

      // These are loaded dynamically from the JSON files created in the bootstrap
      // phase of installation. The bootstrap file is in ~/.simpleiot/{profile} and
      // the defaults.json file is in the installer path.
      //
      import(bootstrap_path).then(bootstrap => {
          import(IOT_DEFAULTS_FILE).then(defaults => {

              // We merge them together and pass them on.
              //
              let config = Object.assign({}, bootstrap, defaults);

              // This prefix is appended to everything so we can run different builds

              let namePrefix = config.name_prefix;
              if (!namePrefix || namePrefix.length === 0) {
                  namePrefix = "iot"
              }
              let stage = config.stage;
              if (!stage || stage.length === 0) {
                  stage = "dev";
              }
              let longUuid: string = uuidv4();
              let lastPart = longUuid.split('-').pop();
              let uuid: string = lastPart ? lastPart : "BADUUID";

              let prefix = namePrefix + "_" + stage;

              config['stage'] = stage;
              config['uuid'] = uuid;
              config['prefix'] = prefix;

              let tags : {[name: string]: any} = {
                  framework : "simpleiot:" + config.simpleiot_version,
                  install_team: config.team,
                  stage: stage,
                  uuid: uuid
              }

              this.createStringParam("simpleiot_version", config.simpleiot_version, "SimpleIOT Version");

              //////////////////////////////////////////////////////////////////////
              // PRE-INSTALL
              // This will run the Pre-Install script, if specified.
              //
              if (RUN_PREINSTALL_STEP) {
                  console.log("- Preinstall Step");
                  this.preInstall = new CDKPreInstall(this, "preinstall", {
                      tags: tags
                  });
              }

              //////////////////////////////////////////////////////////////////////
              // IAM
              // This will create the IAM roles needed by IOT and Lambda.
              //
              if (CREATE_IAM) {
                  console.log("- Processing IAM")
                  this.iam = new CDKIam(this, "iam", {
                      tags: tags,
                      prefix: prefix,
                      stage: stage,
                      uuid: uuid
                  })
              }

              //////////////////////////////////////////////////////////////////////
              // Cognito./
              // This creates the Cognito User Pool and Identity needed by dashboard
              // and APIs to access IOT. In the full release this would be restricted to
              // those with proper access. The client ID will then need to be passed
              // to the dashboard so it can update its config settings.
              //
              if (CREATE_COGNITO) {
                  console.log("- Processing COGNITO")
                  this.cognito = new CDKCognito(this, "cognito", {
                      tags: tags,
                      useSSO: config.use_sso,
                      prefix: prefix,
                      uuid: uuid
                  })
                  this.cognito.node.addDependency(this.iam)


                  // Cognito Outputs
                  //
                  // We output the values that need to be saved for later phases in deployment
                  // they are saved in the output JSON file.
                  // NOTE: If we're in SSO mode, we won't be creating Cognito user pools so we can skip these.
                  //
                  if (!config.use_sso) {
                      Common.output(this, "cognitoSigninUrl",
                          this.cognito.signInUrl,
                          "Cognito Sign-In URL")

                      Common.output(this, "cognitoSigninDomainUrl",
                          this.cognito.domain.baseUrl(),
                          "Cognito Sign-In Domain Url")

                      Common.output(this, "cognitoSigninDomainName",
                          this.cognito.domain.domainName,
                          "Cognito Sign-In Domain Name")

                      Common.output(this, "cognitoUserPoolName",
                          this.cognito.userPoolName,
                          "Cognito User Pool Name")

                      Common.output(this, "cognitoUserPoolId",
                          this.cognito.userPool.userPoolId,
                          "Cognito User Pool ID")

                      Common.output(this, "cognitoUserPoolArn",
                          this.cognito.userPool.userPoolArn,
                          "Cognito User Pool Arn")
                      Common.output(this, "cognitoClientId",
                          this.cognito.userPoolClient.userPoolClientId,
                          "Cognito Client ID")
                  }
                  // Need to output these so they can be added to the configuration files
                  // and used during provisioning of gateways.
                  //
                  Common.output(this, "cognitoIdentityPoolName",
                      this.cognito.identityPoolName,
                      "Cognito Identity Pool Name")

                  Common.output(this, "cognitoIdentityPoolId",
                      this.cognito.identityPool.ref,
                      "Cognito Identity Pool ID")

                  Common.output(this, "cognitoAuthRoleName",
                      this.cognito.authRole.roleName,
                      "Cognito Authenticated Role Name")

                  Common.output(this, "cognitoAuthRoleARN",
                      this.cognito.authRole.roleArn,
                      "Cognito Authenticated Role ARN")

                  this.createBoolParam("with_cognito", true, "Feature: with Cognito")
              } else {
                  this.createBoolParam("with_cognito", false, "Feature: with Cognito")
              }

              //////////////////////////////////////////////////////////////////////
              // S3.
              // Buckets for access to static media.
              //
              if (CREATE_S3) {
                  console.log("- Processing S3")
                  let staticRoot = "./static";

                  this.s3 = new CDKS3(this, "s3", {
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
                  Common.output(this, "fwUpdateBucketName",
                      this.s3.fwUpdateBucketName,
                      "FW Update Bucket Name")
                  Common.output(this, "fwUpdateBucketArn",
                      this.s3.fwUpdateBucket.bucketArn,
                      "FW Update Bucket ARN")
                  Common.output(this, "fwUpdateCFDistributionId",
                      this.s3.fwUpdateCFDistribution.distributionId,
                      "Firmware Update Cloudfront Distribution ID")
                  Common.output(this, "fwUpdateDownloadDomain",
                      this.s3.fwUpdateCFDistribution.distributionDomainName,
                      "Firmware Update Cloudfront Domain Name")

                  // Code Template bucket (not accessed externally)
                  //
                  Common.output(this, "templateBucketName",
                      this.s3.templateBucketName,
                      "Template Bucket Name")
                  Common.output(this, "templateBucketArn",
                      this.s3.templateBucket.bucketArn,
                      "Template Bucket Arn")

                  // Twin media uploads (GLB/USDZ/HDR files for models)
                  //
                  Common.output(this, "twinMediaBucketName",
                      this.s3.twinMediaBucketName,
                      "Twin Media Bucket Name")
                  Common.output(this, "twinMediaBucketArn",
                      this.s3.twinMediaBucket.bucketArn,
                      "Twin Media Bucket Arn")

                  // We don't want direct access to the S3 bucket. All GETs have to
                  // go through CloudFront.
                  //
                  Common.output(this, "twinMediaBucketUrl",
                      this.s3.twinMediaBucket.urlForObject(""),
                      "Twin Media Bucket Url")

                  Common.output(this, "twinMediaCFDistributionId",
                      this.s3.twinMediaCFDistribution.distributionId,
                      "Twin Media Cloudfront Distribution ID")
                  Common.output(this, "twinMediaDomain",
                      this.s3.twinMediaCFDistribution.distributionDomainName,
                      "Twin Media Cloudfront Domain Name")

                  // Code Generator bundles bucket (not accessed externally)
                  //
                  Common.output(this, "generatorBucketName",
                      this.s3.generatorBucketName,
                      "Generator Bucket Name")
                  Common.output(this, "generatorBucketArn",
                      this.s3.generatorBucket.bucketArn,
                      "Generator Bucket Arn")

                  // Web dashboard bucket
                  //
                  Common.output(this, "dashboardBucketName",
                      this.s3.dashboardBucketName,
                      "Dashboard Bucket Name")
                  Common.output(this, "dashboardBucketArn",
                      this.s3.dashboardBucket.bucketArn,
                      "Dashboard Bucket Arn")
                  Common.output(this, "dashboardCFDistributionId",
                      this.s3.dashboardCFDistribution.distributionId,
                      "Dashboard Cloudfront Distribution ID")

                  // This is the big one. You go here to login to the web dashboard.
                  // Note that this is just the domain name, you have to add the "https://"
                  //
                  Common.output(this, "dashboardDomainName",
                      this.s3.dashboardCFDistribution.distributionDomainName,
                      "Dashboard Website Domain")
              }


              //////////////////////////////////////////////////////////////////////
              // Network/VPC
              // This will create the networking layer needed by other components.
              // This is primarily the custom VP.
              //
              // NOTE: for testing, you can specify an existing VPC and Security Group
              //
              if (CREATE_NETWORK) {
                  console.log("- Processing NETWORK/VPC")
                  this.network = new CDKNetwork(this, "network", {
                      tags: tags,
                      prefix: prefix,
                      uuid: uuid,
                      stage: stage
                  })
              }
             this.network.node.addDependency(this.iam)

              //////////////////////////////////////////////////////////////////////
              /// DynamoDB
              //
              // The raw data received via both IOT and REST APIs are saved in DynamoDB.
              // This can be used to run analytics.
              //
              // The values are sent by the lambdas receiving the SET data.
              //
              if (CREATE_DYNAMODB) {
                  console.log("- Processing DYNAMODB")
                  this.dynamodb = new CDKDynamoDB(this,  "dynamodb", {
                      tags: tags,
                      prefix: prefix,
                      uuid: uuid,
                      vpc: this.network.vpc,
                      tableName: "dynamo_table"
                  })
                  this.dynamodb.node.addDependency(this.network)

                  Common.output(this, "dynamoDBTable",
                      this.dynamodb.dynamoDBTable.tableName,
                      "DynamoDB table name")

                  this.createBoolParam("with_dynamodb", true, "Feature: with DynamoDB")
              } else {
                  this.createBoolParam("with_dynamodb", false, "Feature: with DynamoDB")
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
                  console.log("- Processing DATABASE/RDS")
                  this.database = new CDKDatabase(this, "db", {
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
                  })
                  this.database.node.addDependency(this.network)

                  // We output the values that need to be saved for later phases in deployment
                  // in the output JSON file, which will then be loaded into config files.
                  //
                  Common.output(this, "bastionHostSSHDns",
                      this.database.bastion.instancePublicDnsName,
                      "Bastion Host SSH DNS")

                  Common.output(this, "bastionHostSSHIp",
                      this.database.bastion.instancePublicIp,
                      "Bastion Host SSH IP")

                  // CDKDatabase unifies the hostname, whether it's Aurora Cluster or Single RDS instance.
                  //
                  Common.output(this, "dbHostname",
                      this.database.databaseHostname,
                      "Database endpoint hostname")

                  Common.output(this, "bastionSSHAllowedIP",
                      MY_IP,
                      "IP address with SSH access to bastion host")
              }

              //////////////////////////////////////////////////////////////////////
              // LAMBDALAYER
              // This will create the layers used by all lambdas.
              //
              if (CREATE_LAMBDALAYER) {
                  console.log("- Processing LAMBDA LAYER")
                  this.lambdaLayer = new CDKLambdaLayer(this, "lambdalayer", {
                      tags: tags,
                      prefix: prefix,
                      uuid: uuid,
                      stage: stage
                  })
              }

              //////////////////////////////////////////////////////////////////////
              // IOT Static Components (for use during set up and deletion)
              //
              if (CREATE_STATICIOT) {
                  console.log("- Processing IOT INITIALIZER FOR CDK")
                  this.staticIot = new CDKStaticIOT(this, "staticiot", {
                      tags: tags,
                      prefix: prefix,
                      stage: stage,
                      uuid: uuid,
                      logLevel: config.log_level,
                      vpc: this.network.vpc,
                      iam: this.iam,
                      layer: this.lambdaLayer
                  })
                  this.staticIot.node.addDependency(this.iam)
                  this.staticIot.node.addDependency(this.cognito)
                  this.staticIot.node.addDependency(this.lambdaLayer)

                // We output the values that need to be saved for later phases in deployment
                // they are saved in the output JSON file
                //
                Common.output(this, "iotThingPrefix",
                    prefix,
                    "IOT Thing Name Prefix")
                Common.output(this, "iotThingUuidSuffix",
                    uuid,
                    "IOT Thing UUID Suffix")
                Common.output(this, "iotThingEndPoint",
                    this.staticIot.iotMonitorEndpoint,
                    "IOT Thing Monitor Endpoint")
                Common.output(this, "iotCertKeyName",
                    this.staticIot.iotCertKeyName,
                    "IOT Thing Cert Keyname")
                Common.output(this, "iotPrivateKeyName",
                    this.staticIot.iotPrivateKeyName,
                    "IOT Thing Private Keyname")
                Common.output(this, "iotMonitorPolicyName",
                    this.staticIot.iotMonitorPolicyName,
                    "IOT Monitor Policy Name")
              }

              //////////////////////////////////////////////////////////////////////
              // Timestream
              // This will create the Timestream database, used by IOT rules to route
              // IOT messages into it.
              //
              if (CREATE_TIMESTREAM) {
                  console.log("- Processing TIMESTREAM")
                  this.timestream = new CDKTimestream(this, "timestream", {
                      tags: tags,
                      prefix: prefix,
                      uuid: uuid,
                      stage: stage
                  })

                  Common.output(this, "timestreamDatabase",
                    this.timestream.databaseName,
                  "Timestream IOT Database Name")
                  Common.output(this, "timestreamIOTTable",
                    this.timestream.tableName,
                  "Timestream IOT Table Name")

                  this.createBoolParam("with_timestream", true, "Feature: with Timestream")
                  this.createBoolParam("with_grafana", true, "Feature: with Grafana")
              } else {
                  this.createBoolParam("with_timestream", false, "Feature: with Timestream")
                  this.createBoolParam("with_grafana", false, "Feature: with grafana")
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
                  console.log("- Processing LAMBDA")

                  this.lambda = new CDKLambda(this,
                      "lambda", {
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
                      }
                  );

                  // We create dependencies so they all have to finish before we can proceed
                  //
                  this.lambda.node.addDependency(this.lambdaLayer)
                  this.lambda.node.addDependency(this.iam)
                  this.lambda.node.addDependency(this.cognito)
                  this.lambda.node.addDependency(this.network)
                  this.lambda.node.addDependency(this.staticIot)
                  this.lambda.node.addDependency(this.dynamodb)
                  this.lambda.node.addDependency(this.database)
                  if (CREATE_TIMESTREAM) {
                      this.lambda.node.addDependency(this.timestream!)
                  }

                  Common.output(this, "apiEndpoint",
                    this.lambda.apiGw.url,
                "API Endpoint")

              }

              //////////////////////////////////////////////////////////////////////
              // PRE-INSTALL
              // This will run the Post-Install script, if specified.

              if (RUN_POSTINSTALL_STEP) {
                  console.log("- Postinstall Step");
                  this.postInstall = new CDKPostInstall(this, "postinstall", {
                      tags: tags
                  });

                  // If you need this to run AFTER everything else
                  // make sure you add a dependency to it, like so...
                  //
                 this.postInstall.node.addDependency(this.lambda)
                 this.postInstall.node.addDependency(this.cognito)
                 this.postInstall.node.addDependency(this.database)
                 this.postInstall.node.addDependency(this.network)
              }

              Common.output(this, "uuidSuffix",
                  uuid,
                  "Project UUID Suffix");
              Common.output(this, "namePrefix",
                  namePrefix,
                  "Project name prefix");
          });
      });

      // We default to checking for location. If this parameter is set to false, we don't bother looking for it.
      //
      this.createBoolParam("with_location", true, "Feature: with location")

  }

  // These create paramters in the SSM Parameter store.
  // They can then be accessed as /simpleiot/param/??? at runtime.
  //
  createStringParam(key: string, value: string, desc: string) : void {
        new ssm.StringParameter(this, "param_" + key, {
            description: desc,
            parameterName: "/simpleiot/feature/" + key,
            stringValue: value
        });
    }

  createBoolParam(key: string, value: boolean, desc: string) : void {
      this.createStringParam(key, value ? "True" : "False", desc)
  }

  createNumberParam(key: string, value: number, desc: string) : void {
      this.createStringParam(key, value.toString(), desc)
  }

}

module.exports = { IotcdkStack }
