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
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: true} ),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
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
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: true} ),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
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
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: true} ),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
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
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false}),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
            autoDeleteObjects: true
        });
        // For generators (code samples that generate skeleton firmware).
        //
        this.generatorBucketName = bucketPrefix + "-generator-" + props.uuid;
        this.generatorBucket = new s3.Bucket(this, id + "_generator_bucket", {
            bucketName: this.generatorBucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false}),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: "LOGS",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX3MzLW5ldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNka19zMy1uZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7Ozs7R0FJRztBQUNILG1DQUFtQztBQUVuQyx5Q0FBMEM7QUFFMUMsaURBQWlEO0FBRWpELDBEQUEwRDtBQUMxRCxxQ0FBK0I7QUFRL0IsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFFLE1BQU0sQ0FBRSxDQUFBO0FBUTdCLENBQUM7QUFHRixNQUFhLEtBQU0sU0FBUSxHQUFHLENBQUMsV0FBVztJQXVCeEMsWUFBWSxLQUFnQixFQUNoQixFQUFVLEVBQUcsS0FBZTtRQUV0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLGVBQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUVoQywwRUFBMEU7UUFDMUUsa0dBQWtHO1FBQ2xHLEVBQUU7UUFDRixJQUFJLFlBQVksR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFbEQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFlBQVksR0FBRyxhQUFhLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNyRSxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRSxHQUFHLG1CQUFtQixFQUMvRDtZQUNJLFVBQVUsRUFBRSxJQUFJLENBQUMsbUJBQW1CO1lBQ3BDLFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxvQkFBb0IsRUFBRSxZQUFZO1lBQ2xDLG9CQUFvQixFQUFFLFlBQVk7WUFDbEMsSUFBSSxFQUFFO2dCQUNGO29CQUNJLGNBQWMsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDckIsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUFH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dXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgczMgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtczMnKTtcbmltcG9ydCB7IEJ1Y2tldERlcGxveW1lbnQsIFNvdXJjZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JztcbmltcG9ydCBjZiA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JylcbmltcG9ydCBjZm8gPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJylcbmltcG9ydCBzM2RlcGxveSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JylcbmltcG9ydCB7Q29tbW9ufSBmcm9tICcuL2NvbW1vbidcbmltcG9ydCB7QnVja2V0QWNjZXNzQ29udHJvbH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ0Bhd3MtY2RrL2F3cy1pYW0nO1xuLy8gaW1wb3J0IHsgQXV0b0RlbGV0ZUJ1Y2tldCB9IGZyb20gJ0BwbW9zY29kZS9hdXRvLWRlbGV0ZS1idWNrZXQnO1xuaW1wb3J0IHtDREtMYW1iZGFMYXllcn0gZnJvbSBcIi4vY2RrX2xhbWJkYWxheWVyXCI7XG5pbXBvcnQge0NES1N0YXRpY0lPVH0gZnJvbSBcIi4vY2RrX3N0YXRpY2lvdFwiO1xuaW1wb3J0IHtDREtUaW1lc3RyZWFtfSBmcm9tIFwiLi9jZGtfdGltZXN0cmVhbVwiO1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSggXCJwYXRoXCIgKVxuXG5pbnRlcmZhY2UgSVMzUHJvcHMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2tQcm9wcyB7XG4gICAgcHJlZml4OiBzdHJpbmcsXG4gICAgc3RhZ2U6IHN0cmluZyxcbiAgICB1dWlkOiBzdHJpbmcsXG4gICAgczNVcGxvYWRSb290OiBzdHJpbmcsXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59O1xuXG5cbmV4cG9ydCBjbGFzcyBDREtTMyBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG4gIHB1YmxpYyBkYXNoYm9hcmRCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBmd1VwZGF0ZUJ1Y2tldE5hbWU6IHN0cmluZztcbiAgcHVibGljIHR3aW5NZWRpYUJ1Y2tldE5hbWU6IHN0cmluZztcbiAgcHVibGljIGZ3VXBkYXRlQ2xvdWRGcm9udFVybDogc3RyaW5nO1xuICBwdWJsaWMgdHdpbk1lZGlhQ2xvdWRGcm9udFVybDogc3RyaW5nO1xuICBwdWJsaWMgdGVtcGxhdGVCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBnZW5lcmF0b3JCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBkYXNoYm9hcmRCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIGRhc2hib2FyZENGRGlzdHJpYnV0aW9uOiBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgZndVcGRhdGVCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIGZ3VXBkYXRlQ0ZEaXN0cmlidXRpb246IGNmLkNsb3VkRnJvbnRXZWJEaXN0cmlidXRpb247XG4gIHB1YmxpYyB0ZW1wbGF0ZUJ1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgdHdpbk1lZGlhQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyB0d2luTWVkaWFDRkRpc3RyaWJ1dGlvbjogY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbjtcbiAgcHVibGljIGdlbmVyYXRvckJ1Y2tldDogczMuQnVja2V0O1xuICAgIC8vXG4gICAgLy8gQW4gUzMgYnVja2V0IGRlcGxveW1lbnQgYWxsb3dzIHdlYnNpdGVzIHRvIGJlIHVwbG9hZGVkIGZyb20gYSBsb2NhbCBkaXJlY3RvcnkuXG4gICAgLy8gV2UnbGwgbmVlZCBvbmUgZm9yIHRoZSBkYXNoYm9hcmQgaW4gc3Vic2VxdWVudCBwaGFzZXMuXG4gICAgLy9cbiAgcHVibGljIHRlbXBsYXRlQnVja2V0RGVwbG95bWVudDogczNkZXBsb3kuQnVja2V0RGVwbG95bWVudDtcblxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgICAgICAgICAgIGlkOiBzdHJpbmcsICBwcm9wczogSVMzUHJvcHMpXG4gIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIENvbW1vbi5hZGRUYWdzKHRoaXMsIHByb3BzLnRhZ3MpXG5cbiAgICAvLyBCdWNrZXRzIGNhbid0IGhhdmUgdW5kZXJsaW5lcyBpbiB0aGUgbmFtZSBzbyB3ZSBjb252ZXJ0IHRoZW0gdG8gZGFzaGVzLlxuICAgIC8vIE5PVEU6IGNoZWNrIGhlcmUgZm9yIG1vcmUgZGV0YWlscyBvbiBkZXBsb3lpbmcgU1BBczogaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy80OTI4XG4gICAgLy9cbiAgICBsZXQgYnVja2V0UHJlZml4ID0gcHJvcHMucHJlZml4LnJlcGxhY2UoXCJfXCIsIFwiLVwiKTtcblxuICAgIHRoaXMuZGFzaGJvYXJkQnVja2V0TmFtZSA9IGJ1Y2tldFByZWZpeCArIFwiLWRhc2hib2FyZC1cIiArIHByb3BzLnV1aWQ7XG4gICAgdGhpcy5kYXNoYm9hcmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfZGFzaGJvYXJkX2J1Y2tldFwiLFxuICAgICAgICB7XG4gICAgICAgICAgICBidWNrZXROYW1lOiB0aGlzLmRhc2hib2FyZEJ1Y2tldE5hbWUsXG4gICAgICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAgICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogXCJpbmRleC5odG1sXCIsXG4gICAgICAgICAgICB3ZWJzaXRlRXJyb3JEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgICAgICAgY29yczogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgICAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVF0sXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAgICAgICAvLyBibG9ja1B1YmxpY0FjY2VzczogbmV3IHMzLkJsb2NrUHVibGljQWNjZXNzKHsgYmxvY2tQdWJsaWNQb2xpY3k6IHRydWV9ICksXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZVxuICAgICAgICB9XG4gICAgKTtcblxuICAgIGNvbnN0IGRhc2hib2FyZE9JQSA9IG5ldyBjZi5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnZGFzaGJvYXJkT0lBJywge1xuICAgICAgY29tbWVudDogXCJEYXNoYm9hcmQgT0lBXCJcbiAgICB9KTtcbiAgICB0aGlzLmRhc2hib2FyZEJ1Y2tldC5ncmFudFJlYWQoZGFzaGJvYXJkT0lBKTtcblxuICAgIC8vIElmIHdlIHdhbnRlZCB0byBkZXBsb3kgYSBkYXNoYm9hcmQgaGVyZSwgdGhpcyBpcyB3aGF0IHdlIHdvdWxkIHVzZS4gQnV0IHdlIGZpcnN0IGhhdmUgdG9cbiAgICAvLyBnZXQgdGhlIEFQSSBhbmQgSU9UIGVuZHBvaW50cyBhcyB3ZWxsIGFzIENvZ25pdG8gaWRlbnRpZmllcnMsIHRoZW4gcmVidWlsZCB0aGUgZGFzaGJvYXJkXG4gICAgLy8gYmVmb3JlIGNvcHlpbmcgaXQgb3V0LiBTbyB0aGUgYWN0dWFsIGNvcHlpbmcgd2lsbCBoYXZlIHRvIHdhaXQgdW50aWwgYWZ0ZXIgdGhvc2UgaGF2ZVxuICAgIC8vIGJlZW4gY3JlYXRlZCBhbmQgdGhlIGNvbmZpZ3VyYXRpb24gZmlsZXMgcHJvcGVybHkgc2V0IHVwLlxuICAgIC8vXG5cbiAgICAvLyBjb25zdCBkYXNoYm9hcmREZXBsb3ltZW50ID0gbmV3IEJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0RlcGxveVdlYnNpdGUnLCB7XG4gICAgLy8gICAgICAgc291cmNlczogW1NvdXJjZS5hc3NldCgnZGlzdCcpXSxcbiAgICAvLyAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogdGhpcy5kYXNoYm9hcmRCdWNrZXRcbiAgICAvLyAgICAgfSk7XG5cbiAgICB0aGlzLmRhc2hib2FyZENGRGlzdHJpYnV0aW9uID0gbmV3IGNmLkNsb3VkRnJvbnRXZWJEaXN0cmlidXRpb24odGhpcywgJ2Rhc2hib2FyZF9jbG91ZGZyb250X2Rpc3QnLCB7XG4gICAgICAgIG9yaWdpbkNvbmZpZ3M6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzM09yaWdpblNvdXJjZToge1xuICAgICAgICAgICAgICAgICAgICBzM0J1Y2tldFNvdXJjZTogdGhpcy5kYXNoYm9hcmRCdWNrZXQsXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5OiBkYXNoYm9hcmRPSUFcblxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgYmVoYXZpb3JzOiBbe2lzRGVmYXVsdEJlaGF2aW9yOiB0cnVlfV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgdGhpcy5md1VwZGF0ZUJ1Y2tldE5hbWUgPSBidWNrZXRQcmVmaXggKyBcIi1mdy11cGRhdGUtXCIgKyBwcm9wcy51dWlkO1xuICAgIHRoaXMuZndVcGRhdGVCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfZndfdXBkYXRlX2J1Y2tldFwiLFxuICAgICAgICB7XG4gICAgICAgICAgICBidWNrZXROYW1lOiB0aGlzLmZ3VXBkYXRlQnVja2V0TmFtZSxcbiAgICAgICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAgICAgICAvLyBibG9ja1B1YmxpY0FjY2VzczogbmV3IHMzLkJsb2NrUHVibGljQWNjZXNzKHsgYmxvY2tQdWJsaWNQb2xpY3k6IHRydWV9ICksXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZVxuICAgICAgICB9XG4gICAgKTtcblxuICAgIGNvbnN0IGZ3VXBkYXRlT0lBID0gbmV3IGNmLk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsICdmd3VwZGF0ZU9JQScsIHtcbiAgICAgIGNvbW1lbnQ6IFwiRlcgVXBkYXRlIE9JQVwiXG4gICAgfSk7XG4gICAgdGhpcy5md1VwZGF0ZUJ1Y2tldC5ncmFudFJlYWQoZndVcGRhdGVPSUEpO1xuXG4gICAgLy8gVGhpcyBvbmUgaXMgZm9yIGZpcm13YXJlIHVwZGF0ZSBkb3dubG9hZHMuIFRoZXJlJ3Mgbm8gZGVmYXVsdCByb290IG9iamVjdC5cbiAgICAvL1xuICAgIHRoaXMuZndVcGRhdGVDRkRpc3RyaWJ1dGlvbiA9IG5ldyBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uKHRoaXMsICdmd3VwZGF0ZV9jbG91ZGZyb250X2Rpc3QnLCB7XG4gICAgICAgIG9yaWdpbkNvbmZpZ3M6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzM09yaWdpblNvdXJjZToge1xuICAgICAgICAgICAgICAgICAgICBzM0J1Y2tldFNvdXJjZTogdGhpcy5md1VwZGF0ZUJ1Y2tldCxcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHk6IGZ3VXBkYXRlT0lBXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBiZWhhdmlvcnM6IFt7aXNEZWZhdWx0QmVoYXZpb3I6IHRydWV9XVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSk7XG5cbiAgICB0aGlzLnR3aW5NZWRpYUJ1Y2tldE5hbWUgPSBidWNrZXRQcmVmaXggKyBcIi10d2luLW1lZGlhLVwiICsgcHJvcHMudXVpZDtcbiAgICB0aGlzLnR3aW5NZWRpYUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgaWQgKyBcIl90d2luX21lZGlhX2J1Y2tldFwiLFxuICAgICAgICB7XG4gICAgICAgICAgICBidWNrZXROYW1lOiB0aGlzLnR3aW5NZWRpYUJ1Y2tldE5hbWUsXG4gICAgICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgICAgICAgLy8gYmxvY2tQdWJsaWNBY2Nlc3M6IG5ldyBzMy5CbG9ja1B1YmxpY0FjY2Vzcyh7IGJsb2NrUHVibGljUG9saWN5OiB0cnVlfSApLFxuICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgIHNlcnZlckFjY2Vzc0xvZ3NQcmVmaXg6IFwiTE9HU1wiLFxuICAgICAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWVcbiAgICAgICAgfVxuICAgICk7XG4gICAgY29uc3QgdHdpbk1lZGlhT0lBID0gbmV3IGNmLk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsICd0d2luT0lBJywge1xuICAgICAgY29tbWVudDogXCJUd2luIE1lZGlhIE9JQVwiXG4gICAgfSk7XG4gICAgdGhpcy50d2luTWVkaWFCdWNrZXQuZ3JhbnRSZWFkKHR3aW5NZWRpYU9JQSk7XG5cbiAgICAvLyBUaGlzIG9uZSBpcyBmb3IgRGlnaXRhbCBUd2luIE1lZGlhIGRvd25sb2Fkcy4gVGhlcmUncyBubyBkZWZhdWx0IHJvb3Qgb2JqZWN0LlxuICAgIC8vXG4gICAgdGhpcy50d2luTWVkaWFDRkRpc3RyaWJ1dGlvbiA9IG5ldyBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uKHRoaXMsICd0d2luX2Nsb3VkZnJvbnRfZGlzdCcsIHtcbiAgICAgICAgb3JpZ2luQ29uZmlnczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHMzT3JpZ2luU291cmNlOiB7XG4gICAgICAgICAgICAgICAgICAgIHMzQnVja2V0U291cmNlOiB0aGlzLnR3aW5NZWRpYUJ1Y2tldCxcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHk6IHR3aW5NZWRpYU9JQVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgYmVoYXZpb3JzOiBbe2lzRGVmYXVsdEJlaGF2aW9yOiB0cnVlfV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gRm9yIHN0YXRpYyBtZWRpYSBub3Qgb25seSBkbyB3ZSBuZWVkIHRvIGNyZWF0ZSB0aGUgYnVja2V0cyBidXQgd2UgYWxzbyBuZWVkIHRvXG4gICAgLy8gTG9hZCBpdCB3aXRoIG1hdGVyaWFsIGFuZCBpbWFnZXMuIE5PVEU6IHRlbXBsYXRlcyBhbmQgZ2VuZXJhdG9ycyBkbyBub3QgbmVlZFxuICAgIC8vIHRvIGJlIGFjY2Vzc2VkIGV4dGVybmFsbHkgZnJvbSB0aGUgd2ViLiBUaGV5IGFyZSB1c2VkIGludGVybmFsbHkgYnkgdGhlIGxhbWJkYXNcbiAgICAvLyBiZWhpbmQgdGhlIHNjZW5lcy5cbiAgICAvL1xuICAgIHRoaXMudGVtcGxhdGVCdWNrZXROYW1lID0gYnVja2V0UHJlZml4ICsgXCItdGVtcGxhdGUtXCIgKyBwcm9wcy51dWlkO1xuICAgIHRoaXMudGVtcGxhdGVCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfdGVtcGxhdGVfYnVja2V0XCIsXG4gICAgICAgIHtcbiAgICAgICAgICAgIGJ1Y2tldE5hbWU6IHRoaXMudGVtcGxhdGVCdWNrZXROYW1lLFxuICAgICAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgICAgIC8vIGJsb2NrUHVibGljQWNjZXNzOiBuZXcgczMuQmxvY2tQdWJsaWNBY2Nlc3MoeyBibG9ja1B1YmxpY1BvbGljeTogZmFsc2V9KSxcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAgICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiBcIkxPR1NcIixcbiAgICAgICAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlXG4gICAgICAgIH1cbiAgICApXG5cbiAgICAvLyBGb3IgZ2VuZXJhdG9ycyAoY29kZSBzYW1wbGVzIHRoYXQgZ2VuZXJhdGUgc2tlbGV0b24gZmlybXdhcmUpLlxuICAgIC8vXG4gICAgdGhpcy5nZW5lcmF0b3JCdWNrZXROYW1lID0gYnVja2V0UHJlZml4ICsgXCItZ2VuZXJhdG9yLVwiICsgcHJvcHMudXVpZDtcbiAgICB0aGlzLmdlbmVyYXRvckJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgaWQgKyBcIl9nZW5lcmF0b3JfYnVja2V0XCIsXG4gICAgICAgIHtcbiAgICAgICAgICAgIGJ1Y2tldE5hbWU6IHRoaXMuZ2VuZXJhdG9yQnVja2V0TmFtZSxcbiAgICAgICAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAgICAgICAvLyBibG9ja1B1YmxpY0FjY2VzczogbmV3IHMzLkJsb2NrUHVibGljQWNjZXNzKHsgYmxvY2tQdWJsaWNQb2xpY3k6IGZhbHNlfSksXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZVxuICAgICAgICB9XG4gICAgKVxuICAgIC8vIFdlIGRvbid0IGFsbG93IHJlYWQgYWNjZXNzIHRvIHRoZSBidWNrZXQsIGJ1dCBzZXQgaXQgc28gdGhlIGNvbnRlbnRzIGNhbiBiZVxuICAgIC8vIHJlYWQgcHVibGljbHkgLS0gdGhpcyByZXF1aXJlcyBkaXJlY3QgYWNjZXNzIHRvIHRoZSBjb250ZW50cy5cbiAgICAvLyBOT1RFOiBmb3IgZGV2IG1vZGUsIHdlIGNvbW1lbnQgdGhpcyBvdXQgYW5kIG1hbnVhbGx5IHNldCBlYWNoIG9iamVjdCB0byBwdWJsaWMuXG4gICAgLy9cblxuICAgIC8vIHRoaXMuc3RhdGljTWVkaWFCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAvLyAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAvLyAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnXSxcbiAgICAvLyAgICAgcmVzb3VyY2VzOiBbIHRoaXMuc3RhdGljTWVkaWFCdWNrZXQuYXJuRm9yT2JqZWN0cygnKicpXSxcbiAgICAvLyAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldXG4gICAgLy8gICB9KVxuICAgIC8vICk7XG5cbiAgICBsZXQgdGVtcGxhdGVfc291cmNlX3BhdGggPSBwYXRoLnJlc29sdmUocHJvcHMuczNVcGxvYWRSb290LCBcInRlbXBsYXRlX2ZpbGVzXCIpO1xuXG4gICAgdGhpcy50ZW1wbGF0ZUJ1Y2tldERlcGxveW1lbnQgPSBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLFwidGVtcGxhdGVfczNfZGVwbG95bWVudFwiLFxuICAgICAgICB7XG4gICAgICAgICAgc291cmNlczogW1xuICAgICAgICAgICAgICBzM2RlcGxveS5Tb3VyY2UuYXNzZXQodGVtcGxhdGVfc291cmNlX3BhdGgpXG4gICAgICAgICAgXSxcbiAgICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogdGhpcy50ZW1wbGF0ZUJ1Y2tldFxuICAgICAgICB9XG4gICAgKVxuICB9XG59XG4iXX0=