"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKS3 = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
 */
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const cf = require("aws-cdk-lib/aws-cloudfront");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const common_1 = require("./common");
const path = require("path");
;
class CDKS3 extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // Buckets can't have underlines in the name so we convert them to dashes.
        // NOTE: check here for more details on deploying SPAs: https://github.com/aws/aws-cdk/issues/4928
        //
        let bucketPrefix = props.prefix.replace("_", "-");
        this.dashboardBucketName = bucketPrefix + "-dashboard-" + props.uuid;
        this.dashboardBucket = new s3.Bucket(this, id + "_dashboard_bucket", {
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
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
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
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ]
        });
        this.fwUpdateBucketName = bucketPrefix + "-fw-update-" + props.uuid;
        this.fwUpdateBucket = new s3.Bucket(this, id + "_fw_update_bucket", {
            bucketName: this.fwUpdateBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
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
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ]
        });
        this.twinMediaBucketName = bucketPrefix + "-twin-media-" + props.uuid;
        this.twinMediaBucket = new s3.Bucket(this, id + "_twin_media_bucket", {
            bucketName: this.twinMediaBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
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
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ]
        });
        // For static media not only do we need to create the buckets but we also need to
        // Load it with material and images. NOTE: templates and generators do not need
        // to be accessed externally from the web. They are used internally by the lambdas
        // behind the scenes.
        //
        this.templateBucketName = bucketPrefix + "-template-" + props.uuid;
        this.templateBucket = new s3.Bucket(this, id + "_template_bucket", {
            bucketName: this.templateBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
        // For generators (code samples that generate skeleton firmware).
        //
        this.generatorBucketName = bucketPrefix + "-generator-" + props.uuid;
        this.generatorBucket = new s3.Bucket(this, id + "_generator_bucket", {
            bucketName: this.generatorBucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
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
        this.templateBucketDeployment = new s3deploy.BucketDeployment(this, "template_s3_deployment", {
            sources: [
                s3deploy.Source.asset(template_source_path)
            ],
            destinationBucket: this.templateBucket
        });
    }
}
exports.CDKS3 = CDKS3;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX3MzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX3MzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0dBSUc7QUFDSCxtQ0FBbUM7QUFFbkMseUNBQTBDO0FBRTFDLGlEQUFpRDtBQUVqRCwwREFBMEQ7QUFDMUQscUNBQStCO0FBUS9CLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBRSxNQUFNLENBQUUsQ0FBQTtBQVE3QixDQUFDO0FBR0YsTUFBYSxLQUFNLFNBQVEsR0FBRyxDQUFDLFdBQVc7SUF1QnhDLFlBQVksS0FBZ0IsRUFDaEIsRUFBVSxFQUFHLEtBQWU7UUFFdEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMsMEVBQTBFO1FBQzFFLGtHQUFrRztRQUNsRyxFQUFFO1FBQ0YsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRWxELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxZQUFZLEdBQUcsYUFBYSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDckUsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUUsR0FBRyxtQkFBbUIsRUFDL0Q7WUFDSSxVQUFVLEVBQUUsSUFBSSxDQUFDLG1CQUFtQjtZQUNwQyxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsb0JBQW9CLEVBQUUsWUFBWTtZQUNsQyxvQkFBb0IsRUFBRSxZQUFZO1lBQ2xDLElBQUksRUFBRTtnQkFDRjtvQkFDSSxjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQ3JCLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDO2lC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QUFDLG9CQUFvQixDQUFDO2FBQzlDO1lBQ0QsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGNBQWM7U0FDdkMsQ0FDSixDQUFBO0lBQ0gsQ0FBQztDQUNGO0FBMU1ELHNCQTBNQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgczMgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtczMnKTtcbmltcG9ydCB7IEJ1Y2tldERlcGxveW1lbnQsIFNvdXJjZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JztcbmltcG9ydCBjZiA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JylcbmltcG9ydCBjZm8gPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJylcbmltcG9ydCBzM2RlcGxveSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JylcbmltcG9ydCB7Q29tbW9ufSBmcm9tICcuL2NvbW1vbidcbmltcG9ydCB7QnVja2V0QWNjZXNzQ29udHJvbH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQXV0b0RlbGV0ZUJ1Y2tldCB9IGZyb20gJ0BwbW9zY29kZS9hdXRvLWRlbGV0ZS1idWNrZXQnO1xuaW1wb3J0IHtDREtMYW1iZGFMYXllcn0gZnJvbSBcIi4vY2RrX2xhbWJkYWxheWVyXCI7XG5pbXBvcnQge0NES1N0YXRpY0lPVH0gZnJvbSBcIi4vY2RrX3N0YXRpY2lvdFwiO1xuaW1wb3J0IHtDREtUaW1lc3RyZWFtfSBmcm9tIFwiLi9jZGtfdGltZXN0cmVhbVwiO1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSggXCJwYXRoXCIgKVxuXG5pbnRlcmZhY2UgSVMzUHJvcHMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2tQcm9wcyB7XG4gICAgcHJlZml4OiBzdHJpbmcsXG4gICAgc3RhZ2U6IHN0cmluZyxcbiAgICB1dWlkOiBzdHJpbmcsXG4gICAgczNVcGxvYWRSb290OiBzdHJpbmcsXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59O1xuXG5cbmV4cG9ydCBjbGFzcyBDREtTMyBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG4gIHB1YmxpYyBkYXNoYm9hcmRCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBmd1VwZGF0ZUJ1Y2tldE5hbWU6IHN0cmluZztcbiAgcHVibGljIHR3aW5NZWRpYUJ1Y2tldE5hbWU6IHN0cmluZztcbiAgcHVibGljIGZ3VXBkYXRlQ2xvdWRGcm9udFVybDogc3RyaW5nO1xuICBwdWJsaWMgdHdpbk1lZGlhQ2xvdWRGcm9udFVybDogc3RyaW5nO1xuICBwdWJsaWMgdGVtcGxhdGVCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBnZW5lcmF0b3JCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBkYXNoYm9hcmRCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIGRhc2hib2FyZENGRGlzdHJpYnV0aW9uOiBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgZndVcGRhdGVCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIGZ3VXBkYXRlQ0ZEaXN0cmlidXRpb246IGNmLkNsb3VkRnJvbnRXZWJEaXN0cmlidXRpb247XG4gIHB1YmxpYyB0ZW1wbGF0ZUJ1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgdHdpbk1lZGlhQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyB0d2luTWVkaWFDRkRpc3RyaWJ1dGlvbjogY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbjtcbiAgcHVibGljIGdlbmVyYXRvckJ1Y2tldDogczMuQnVja2V0O1xuICAgIC8vXG4gICAgLy8gQW4gUzMgYnVja2V0IGRlcGxveW1lbnQgYWxsb3dzIHdlYnNpdGVzIHRvIGJlIHVwbG9hZGVkIGZyb20gYSBsb2NhbCBkaXJlY3RvcnkuXG4gICAgLy8gV2UnbGwgbmVlZCBvbmUgZm9yIHRoZSBkYXNoYm9hcmQgaW4gc3Vic2VxdWVudCBwaGFzZXMuXG4gICAgLy9cbiAgcHVibGljIHRlbXBsYXRlQnVja2V0RGVwbG95bWVudDogczNkZXBsb3kuQnVja2V0RGVwbG95bWVudDtcblxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgICAgICAgICAgIGlkOiBzdHJpbmcsICBwcm9wczogSVMzUHJvcHMpXG4gIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIENvbW1vbi5hZGRUYWdzKHRoaXMsIHByb3BzLnRhZ3MpXG5cbiAgICAvLyBCdWNrZXRzIGNhbid0IGhhdmUgdW5kZXJsaW5lcyBpbiB0aGUgbmFtZSBzbyB3ZSBjb252ZXJ0IHRoZW0gdG8gZGFzaGVzLlxuICAgIC8vIE5PVEU6IGNoZWNrIGhlcmUgZm9yIG1vcmUgZGV0YWlscyBvbiBkZXBsb3lpbmcgU1BBczogaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy80OTI4XG4gICAgLy9cbiAgICBsZXQgYnVja2V0UHJlZml4ID0gcHJvcHMucHJlZml4LnJlcGxhY2UoXCJfXCIsIFwiLVwiKTtcblxuICAgIHRoaXMuZGFzaGJvYXJkQnVja2V0TmFtZSA9IGJ1Y2tldFByZWZpeCArIFwiLWRhc2hib2FyZC1cIiArIHByb3BzLnV1aWQ7XG4gICAgdGhpcy5kYXNoYm9hcmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfZGFzaGJvYXJkX2J1Y2tldFwiLFxuICAgICAgICB7XG4gICAgICAgICAgICBidWNrZXROYW1lOiB0aGlzLmRhc2hib2FyZEJ1Y2tldE5hbWUsXG4gICAgICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAgICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogXCJpbmRleC5odG1sXCIsXG4gICAgICAgICAgICB3ZWJzaXRlRXJyb3JEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgICAgICAgY29yczogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgICAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVF0sXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAgICAgICBhY2Nlc3NDb250cm9sOiBzMy5CdWNrZXRBY2Nlc3NDb250cm9sLkxPR19ERUxJVkVSWV9XUklURSxcbiAgICAgICAgICAgIC8vIHNlcnZlckFjY2Vzc0xvZ3NQcmVmaXg6IFwiTE9HU1wiLFxuICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlXG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgY29uc3QgZGFzaGJvYXJkT0lBID0gbmV3IGNmLk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsICdkYXNoYm9hcmRPSUEnLCB7XG4gICAgICBjb21tZW50OiBcIkRhc2hib2FyZCBPSUFcIlxuICAgIH0pO1xuICAgIHRoaXMuZGFzaGJvYXJkQnVja2V0LmdyYW50UmVhZChkYXNoYm9hcmRPSUEpO1xuXG4gICAgLy8gSWYgd2Ugd2FudGVkIHRvIGRlcGxveSBhIGRhc2hib2FyZCBoZXJlLCB0aGlzIGlzIHdoYXQgd2Ugd291bGQgdXNlLiBCdXQgd2UgZmlyc3QgaGF2ZSB0b1xuICAgIC8vIGdldCB0aGUgQVBJIGFuZCBJT1QgZW5kcG9pbnRzIGFzIHdlbGwgYXMgQ29nbml0byBpZGVudGlmaWVycywgdGhlbiByZWJ1aWxkIHRoZSBkYXNoYm9hcmRcbiAgICAvLyBiZWZvcmUgY29weWluZyBpdCBvdXQuIFNvIHRoZSBhY3R1YWwgY29weWluZyB3aWxsIGhhdmUgdG8gd2FpdCB1bnRpbCBhZnRlciB0aG9zZSBoYXZlXG4gICAgLy8gYmVlbiBjcmVhdGVkIGFuZCB0aGUgY29uZmlndXJhdGlvbiBmaWxlcyBwcm9wZXJseSBzZXQgdXAuXG4gICAgLy9cblxuICAgIC8vIGNvbnN0IGRhc2hib2FyZERlcGxveW1lbnQgPSBuZXcgQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95V2Vic2l0ZScsIHtcbiAgICAvLyAgICAgICBzb3VyY2VzOiBbU291cmNlLmFzc2V0KCdkaXN0JyldLFxuICAgIC8vICAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiB0aGlzLmRhc2hib2FyZEJ1Y2tldFxuICAgIC8vICAgICB9KTtcblxuICAgIHRoaXMuZGFzaGJvYXJkQ0ZEaXN0cmlidXRpb24gPSBuZXcgY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbih0aGlzLCAnZGFzaGJvYXJkX2Nsb3VkZnJvbnRfZGlzdCcsIHtcbiAgICAgICAgb3JpZ2luQ29uZmlnczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHMzT3JpZ2luU291cmNlOiB7XG4gICAgICAgICAgICAgICAgICAgIHMzQnVja2V0U291cmNlOiB0aGlzLmRhc2hib2FyZEJ1Y2tldCxcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHk6IGRhc2hib2FyZE9JQVxuXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBiZWhhdmlvcnM6IFt7aXNEZWZhdWx0QmVoYXZpb3I6IHRydWV9XVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSk7XG5cbiAgICB0aGlzLmZ3VXBkYXRlQnVja2V0TmFtZSA9IGJ1Y2tldFByZWZpeCArIFwiLWZ3LXVwZGF0ZS1cIiArIHByb3BzLnV1aWQ7XG4gICAgdGhpcy5md1VwZGF0ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgaWQgKyBcIl9md191cGRhdGVfYnVja2V0XCIsXG4gICAgICAgIHtcbiAgICAgICAgICAgIGJ1Y2tldE5hbWU6IHRoaXMuZndVcGRhdGVCdWNrZXROYW1lLFxuICAgICAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2w6IHMzLkJ1Y2tldEFjY2Vzc0NvbnRyb2wuTE9HX0RFTElWRVJZX1dSSVRFLFxuICAgICAgICAgICAgLy8gc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWVcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBmd1VwZGF0ZU9JQSA9IG5ldyBjZi5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnZnd1cGRhdGVPSUEnLCB7XG4gICAgICBjb21tZW50OiBcIkZXIFVwZGF0ZSBPSUFcIlxuICAgIH0pO1xuICAgIHRoaXMuZndVcGRhdGVCdWNrZXQuZ3JhbnRSZWFkKGZ3VXBkYXRlT0lBKTtcblxuICAgIC8vIFRoaXMgb25lIGlzIGZvciBmaXJtd2FyZSB1cGRhdGUgZG93bmxvYWRzLiBUaGVyZSdzIG5vIGRlZmF1bHQgcm9vdCBvYmplY3QuXG4gICAgLy9cbiAgICB0aGlzLmZ3VXBkYXRlQ0ZEaXN0cmlidXRpb24gPSBuZXcgY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbih0aGlzLCAnZnd1cGRhdGVfY2xvdWRmcm9udF9kaXN0Jywge1xuICAgICAgICBvcmlnaW5Db25maWdzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgczNPcmlnaW5Tb3VyY2U6IHtcbiAgICAgICAgICAgICAgICAgICAgczNCdWNrZXRTb3VyY2U6IHRoaXMuZndVcGRhdGVCdWNrZXQsXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5OiBmd1VwZGF0ZU9JQVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgYmVoYXZpb3JzOiBbe2lzRGVmYXVsdEJlaGF2aW9yOiB0cnVlfV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgdGhpcy50d2luTWVkaWFCdWNrZXROYW1lID0gYnVja2V0UHJlZml4ICsgXCItdHdpbi1tZWRpYS1cIiArIHByb3BzLnV1aWQ7XG4gICAgdGhpcy50d2luTWVkaWFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfdHdpbl9tZWRpYV9idWNrZXRcIixcbiAgICAgICAge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogdGhpcy50d2luTWVkaWFCdWNrZXROYW1lLFxuICAgICAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2w6IHMzLkJ1Y2tldEFjY2Vzc0NvbnRyb2wuTE9HX0RFTElWRVJZX1dSSVRFLFxuICAgICAgICAgICAgLy8gc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWVcbiAgICAgICAgfVxuICAgICk7XG4gICAgY29uc3QgdHdpbk1lZGlhT0lBID0gbmV3IGNmLk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsICd0d2luT0lBJywge1xuICAgICAgY29tbWVudDogXCJUd2luIE1lZGlhIE9JQVwiXG4gICAgfSk7XG4gICAgdGhpcy50d2luTWVkaWFCdWNrZXQuZ3JhbnRSZWFkKHR3aW5NZWRpYU9JQSk7XG5cbiAgICAvLyBUaGlzIG9uZSBpcyBmb3IgRGlnaXRhbCBUd2luIE1lZGlhIGRvd25sb2Fkcy4gVGhlcmUncyBubyBkZWZhdWx0IHJvb3Qgb2JqZWN0LlxuICAgIC8vXG4gICAgdGhpcy50d2luTWVkaWFDRkRpc3RyaWJ1dGlvbiA9IG5ldyBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uKHRoaXMsICd0d2luX2Nsb3VkZnJvbnRfZGlzdCcsIHtcbiAgICAgICAgb3JpZ2luQ29uZmlnczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHMzT3JpZ2luU291cmNlOiB7XG4gICAgICAgICAgICAgICAgICAgIHMzQnVja2V0U291cmNlOiB0aGlzLnR3aW5NZWRpYUJ1Y2tldCxcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHk6IHR3aW5NZWRpYU9JQVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgYmVoYXZpb3JzOiBbe2lzRGVmYXVsdEJlaGF2aW9yOiB0cnVlfV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gRm9yIHN0YXRpYyBtZWRpYSBub3Qgb25seSBkbyB3ZSBuZWVkIHRvIGNyZWF0ZSB0aGUgYnVja2V0cyBidXQgd2UgYWxzbyBuZWVkIHRvXG4gICAgLy8gTG9hZCBpdCB3aXRoIG1hdGVyaWFsIGFuZCBpbWFnZXMuIE5PVEU6IHRlbXBsYXRlcyBhbmQgZ2VuZXJhdG9ycyBkbyBub3QgbmVlZFxuICAgIC8vIHRvIGJlIGFjY2Vzc2VkIGV4dGVybmFsbHkgZnJvbSB0aGUgd2ViLiBUaGV5IGFyZSB1c2VkIGludGVybmFsbHkgYnkgdGhlIGxhbWJkYXNcbiAgICAvLyBiZWhpbmQgdGhlIHNjZW5lcy5cbiAgICAvL1xuICAgIHRoaXMudGVtcGxhdGVCdWNrZXROYW1lID0gYnVja2V0UHJlZml4ICsgXCItdGVtcGxhdGUtXCIgKyBwcm9wcy51dWlkO1xuICAgIHRoaXMudGVtcGxhdGVCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfdGVtcGxhdGVfYnVja2V0XCIsXG4gICAgICAgIHtcbiAgICAgICAgICAgIGJ1Y2tldE5hbWU6IHRoaXMudGVtcGxhdGVCdWNrZXROYW1lLFxuICAgICAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2w6IHMzLkJ1Y2tldEFjY2Vzc0NvbnRyb2wuTE9HX0RFTElWRVJZX1dSSVRFLFxuICAgICAgICAgICAgLy8gc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWVcbiAgICAgICAgfVxuICAgIClcblxuICAgIC8vIEZvciBnZW5lcmF0b3JzIChjb2RlIHNhbXBsZXMgdGhhdCBnZW5lcmF0ZSBza2VsZXRvbiBmaXJtd2FyZSkuXG4gICAgLy9cbiAgICB0aGlzLmdlbmVyYXRvckJ1Y2tldE5hbWUgPSBidWNrZXRQcmVmaXggKyBcIi1nZW5lcmF0b3ItXCIgKyBwcm9wcy51dWlkO1xuICAgIHRoaXMuZ2VuZXJhdG9yQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBpZCArIFwiX2dlbmVyYXRvcl9idWNrZXRcIixcbiAgICAgICAge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogdGhpcy5nZW5lcmF0b3JCdWNrZXROYW1lLFxuICAgICAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2w6IHMzLkJ1Y2tldEFjY2Vzc0NvbnRyb2wuTE9HX0RFTElWRVJZX1dSSVRFLFxuICAgICAgICAgICAgLy8gc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWVcbiAgICAgICAgfVxuICAgIClcbiAgICAvLyBXZSBkb24ndCBhbGxvdyByZWFkIGFjY2VzcyB0byB0aGUgYnVja2V0LCBidXQgc2V0IGl0IHNvIHRoZSBjb250ZW50cyBjYW4gYmVcbiAgICAvLyByZWFkIHB1YmxpY2x5IC0tIHRoaXMgcmVxdWlyZXMgZGlyZWN0IGFjY2VzcyB0byB0aGUgY29udGVudHMuXG4gICAgLy8gTk9URTogZm9yIGRldiBtb2RlLCB3ZSBjb21tZW50IHRoaXMgb3V0IGFuZCBtYW51YWxseSBzZXQgZWFjaCBvYmplY3QgdG8gcHVibGljLlxuICAgIC8vXG5cbiAgICAvLyB0aGlzLnN0YXRpY01lZGlhQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgLy8gICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgLy8gICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgLy8gICAgIHJlc291cmNlczogWyB0aGlzLnN0YXRpY01lZGlhQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgLy8gICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXVxuICAgIC8vICAgfSlcbiAgICAvLyApO1xuXG4gICAgbGV0IHRlbXBsYXRlX3NvdXJjZV9wYXRoID0gcGF0aC5yZXNvbHZlKHByb3BzLnMzVXBsb2FkUm9vdCwgXCJ0ZW1wbGF0ZV9maWxlc1wiKTtcblxuICAgIHRoaXMudGVtcGxhdGVCdWNrZXREZXBsb3ltZW50ID0gbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcyxcInRlbXBsYXRlX3MzX2RlcGxveW1lbnRcIixcbiAgICAgICAge1xuICAgICAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHRlbXBsYXRlX3NvdXJjZV9wYXRoKVxuICAgICAgICAgIF0sXG4gICAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHRoaXMudGVtcGxhdGVCdWNrZXRcbiAgICAgICAgfVxuICAgIClcbiAgfVxufVxuIl19