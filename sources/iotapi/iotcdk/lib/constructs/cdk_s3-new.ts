/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import s3 = require('aws-cdk-lib/aws-s3');
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import cf = require('aws-cdk-lib/aws-cloudfront')
import cfo = require('aws-cdk-lib/aws-cloudfront-origins')
import s3deploy = require('aws-cdk-lib/aws-s3-deployment')
import {Common} from './common'
import {BucketAccessControl} from "@aws-cdk/aws-s3";
import * as iam from '@aws-cdk/aws-iam';
// import { AutoDeleteBucket } from '@pmoscode/auto-delete-bucket';
import {CDKLambdaLayer} from "./cdk_lambdalayer";
import {CDKStaticIOT} from "./cdk_staticiot";
import {CDKTimestream} from "./cdk_timestream";

const path = require( "path" )

interface IS3Props extends cdk.NestedStackProps {
    prefix: string,
    stage: string,
    uuid: string,
    s3UploadRoot: string,
    tags: {[name: string]: any}
};


export class CDKS3 extends cdk.NestedStack {
  public dashboardBucketName: string;
  public fwUpdateBucketName: string;
  public twinMediaBucketName: string;
  public fwUpdateCloudFrontUrl: string;
  public twinMediaCloudFrontUrl: string;
  public templateBucketName: string;
  public generatorBucketName: string;
  public dashboardBucket: s3.Bucket;
  public dashboardCFDistribution: cf.CloudFrontWebDistribution;
  public fwUpdateBucket: s3.Bucket;
  public fwUpdateCFDistribution: cf.CloudFrontWebDistribution;
  public templateBucket: s3.Bucket;
  public twinMediaBucket: s3.Bucket;
  public twinMediaCFDistribution: cf.CloudFrontWebDistribution;
  public generatorBucket: s3.Bucket;
    //
    // An S3 bucket deployment allows websites to be uploaded from a local directory.
    // We'll need one for the dashboard in subsequent phases.
    //
  public templateBucketDeployment: s3deploy.BucketDeployment;


  constructor(scope: Construct,
              id: string,  props: IS3Props)
  {
    super(scope, id);
    Common.addTags(this, props.tags)

    // Buckets can't have underlines in the name so we convert them to dashes.
    // NOTE: check here for more details on deploying SPAs: https://github.com/aws/aws-cdk/issues/4928
    //
    let bucketPrefix = props.prefix.replace("_", "-");

    this.dashboardBucketName = bucketPrefix + "-dashboard-" + props.uuid;
    this.dashboardBucket = new s3.Bucket(this, id + "_dashboard_bucket",
        {
            bucketName: this.dashboardBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            websiteIndexDocument: "index.html",
            websiteErrorDocument: 'index.html',
            cors: [
                {
                    allowedOrigins: ['*'],
                    allowedMethods: [s3.HttpMethods.GET],
                }
            ],
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: true} ),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
            autoDeleteObjects: true
        }
    );

    const dashboardOIA = new cf.OriginAccessIdentity(this, 'dashboardOIA', {
      comment: "Dashboard OIA"
    });
    this.dashboardBucket.grantRead(dashboardOIA);

    // If we wanted to deploy a dashboard here, this is what we would use. But we first have to
    // get the API and IOT endpoints as well as Cognito identifiers, then rebuild the dashboard
    // before copying it out. So the actual copying will have to wait until after those have
    // been created and the configuration files properly set up.
    //

    // const dashboardDeployment = new BucketDeployment(this, 'DeployWebsite', {
    //       sources: [Source.asset('dist')],
    //       destinationBucket: this.dashboardBucket
    //     });

    this.dashboardCFDistribution = new cf.CloudFrontWebDistribution(this, 'dashboard_cloudfront_dist', {
        originConfigs: [
            {
                s3OriginSource: {
                    s3BucketSource: this.dashboardBucket,
                    originAccessIdentity: dashboardOIA

                },
                behaviors: [{isDefaultBehavior: true}]
            }
        ]
    });

    this.fwUpdateBucketName = bucketPrefix + "-fw-update-" + props.uuid;
    this.fwUpdateBucket = new s3.Bucket(this, id + "_fw_update_bucket",
        {
            bucketName: this.fwUpdateBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: true} ),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
            autoDeleteObjects: true
        }
    );

    const fwUpdateOIA = new cf.OriginAccessIdentity(this, 'fwupdateOIA', {
      comment: "FW Update OIA"
    });
    this.fwUpdateBucket.grantRead(fwUpdateOIA);

    // This one is for firmware update downloads. There's no default root object.
    //
    this.fwUpdateCFDistribution = new cf.CloudFrontWebDistribution(this, 'fwupdate_cloudfront_dist', {
        originConfigs: [
            {
                s3OriginSource: {
                    s3BucketSource: this.fwUpdateBucket,
                    originAccessIdentity: fwUpdateOIA
                },
                behaviors: [{isDefaultBehavior: true}]
            }
        ]
    });

    this.twinMediaBucketName = bucketPrefix + "-twin-media-" + props.uuid;
    this.twinMediaBucket = new s3.Bucket(this, id + "_twin_media_bucket",
        {
            bucketName: this.twinMediaBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: true} ),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
            autoDeleteObjects: true
        }
    );
    const twinMediaOIA = new cf.OriginAccessIdentity(this, 'twinOIA', {
      comment: "Twin Media OIA"
    });
    this.twinMediaBucket.grantRead(twinMediaOIA);

    // This one is for Digital Twin Media downloads. There's no default root object.
    //
    this.twinMediaCFDistribution = new cf.CloudFrontWebDistribution(this, 'twin_cloudfront_dist', {
        originConfigs: [
            {
                s3OriginSource: {
                    s3BucketSource: this.twinMediaBucket,
                    originAccessIdentity: twinMediaOIA
                },
                behaviors: [{isDefaultBehavior: true}]
            }
        ]
    });

    // For static media not only do we need to create the buckets but we also need to
    // Load it with material and images. NOTE: templates and generators do not need
    // to be accessed externally from the web. They are used internally by the lambdas
    // behind the scenes.
    //
    this.templateBucketName = bucketPrefix + "-template-" + props.uuid;
    this.templateBucket = new s3.Bucket(this, id + "_template_bucket",
        {
            bucketName: this.templateBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false}),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
            autoDeleteObjects: true
        }
    )

    // For generators (code samples that generate skeleton firmware).
    //
    this.generatorBucketName = bucketPrefix + "-generator-" + props.uuid;
    this.generatorBucket = new s3.Bucket(this, id + "_generator_bucket",
        {
            bucketName: this.generatorBucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false}),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
            autoDeleteObjects: true
        }
    )
    // We don't allow read access to the bucket, but set it so the contents can be
    // read publicly -- this requires direct access to the contents.
    // NOTE: for dev mode, we comment this out and manually set each object to public.
    //

    // this.staticMediaBucket.addToResourcePolicy(
    //   new iam.PolicyStatement({
    //     actions: ['s3:GetObject'],
    //     resources: [ this.staticMediaBucket.arnForObjects('*')],
    //     principals: [new iam.AnyPrincipal()]
    //   })
    // );

    let template_source_path = path.resolve(props.s3UploadRoot, "template_files");

    this.templateBucketDeployment = new s3deploy.BucketDeployment(this,"template_s3_deployment",
        {
          sources: [
              s3deploy.Source.asset(template_source_path)
          ],
          destinationBucket: this.templateBucket
        }
    )
  }
}
