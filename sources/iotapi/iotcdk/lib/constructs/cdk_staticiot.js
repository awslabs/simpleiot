"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKStaticIOT = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const common_1 = require("./common");
const path = require("path");
const uuid_1 = require("uuid");
class CDKStaticIOT extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        let sourcePath = path.resolve("./lib/lambda_src/iot_static_setup");
        // First, we create a singleton lambda that can create the IOT things we need.
        // Then we create a custom CFN resource to invoke it. This will be used by CDK to
        // instantiate what it needs (and delete things when it's time to clean)
        // The libraries needed by the Lambda are in the layer assigned to the lambda
        // and will be shared at runtime by IOT Thing creation mechanisms.
        //
        this.iotSetupLambda = new lambda.SingletonFunction(this, "iot_setup_singleton", {
            uuid: (0, uuid_1.v4)(),
            handler: "main.handler",
            runtime: common_1.Common.pythonRuntimeVersion(),
            role: props.iam.iotLambdaFullAccessRole,
            layers: props.layer.allLayers,
            timeout: cdk.Duration.seconds(300),
            code: new lambda.AssetCode(sourcePath),
            environment: {
                "PREFIX": props.prefix,
                "STAGE": props.stage,
                "IOT_LOGLEVEL": props.logLevel
            }
        });
        // Now we create the custom resource that relies on the lambda to create what is needed
        // during CDK setup. NOTE: we specify the 'resourceType' as a name so CloudFormation
        // can properly update it without getting into a dependency loop.
        //
        let iotInitializeResource = new cdk.CustomResource(this, "iot_static_init_resource", {
            serviceToken: this.iotSetupLambda.functionArn,
            resourceType: "Custom::simpleiot_static_init_resource",
            properties: {
                'Namespace': props.prefix,
                'Action': 'initialize',
                'Name': 'monitor',
                'Uuid': props.uuid,
                'CertsInSSM': true,
                'CertsInline': false,
                'Stage': props.stage,
                'LogLevel': props.logLevel
            }
        });
        let response = iotInitializeResource.getAtt("Response");
        //console.log("Got response from IOT Lambda initialization: " + this.initResponse);
        this.initResponse = response.toString();
        if (this.initResponse) {
            try {
                let iotResponse = JSON.parse(this.initResponse);
                console.log("Got response from IOT custom create: " + this.initResponse);
                this.iotMonitorEndpoint = iotResponse['iot_endpoint'];
                this.iotCertKeyName = iotResponse['iot_certkeyname'];
                this.iotPrivateKeyName = iotResponse['iot_privatekeyname'];
                this.iotMonitorPolicyName = iotResponse['policy_name'];
                // NOTE NOTE NOTE: in dev mode these settings should be saved in a database so the next
                // team member who comes to play gets them downloaded to their system so they can access
                // IOT certs, etc. We could move them to SecretsManager, but there is a 40K limit to
                // secrets and there's a risk we might run out.
            }
            catch (e) {
                // during build phase, parsing JSON can throw an exception, so we catch it and ignore it.
            }
        }
        else {
            this.iotMonitorEndpoint = "** invalid **";
            this.iotCertKeyName = "** invalid **";
            this.iotPrivateKeyName = "** invalid **";
            this.iotMonitorPolicyName = "** invalid **";
        }
    }
}
exports.CDKStaticIOT = CDKStaticIOT;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX3N0YXRpY2lvdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNka19zdGF0aWNpb3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7Ozs7RUFJRTtBQUNGLG1DQUFtQztBQUduQyxpREFBaUQ7QUFFakQscUNBQWlDO0FBSWpDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBRSxNQUFNLENBQUUsQ0FBQztBQUMvQiwrQkFBb0M7QUFhcEMsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLFdBQVc7SUFTN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUU1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLGVBQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUVoQyxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFFakUsOEVBQThFO1FBQzlFLGlGQUFpRjtRQUNqRix3RUFBd0U7UUFDeEUsNkVBQTZFO1FBQzdFLGtFQUFrRTtRQUNsRSxFQUFFO1FBRUYsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQ3hFO1lBQ0ksSUFBSSxFQUFFLElBQUEsU0FBTSxHQUFFO1lBQ2QsT0FBTyxFQUFFLGNBQWM7WUFDdkIsT0FBTyxFQUFFLGVBQU0sQ0FBQyxvQkFBb0IsRUFBRTtZQUN0QyxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7WUFDdkMsTUFBTSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUztZQUM3QixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQ2xDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO1lBQ3RDLFdBQVcsRUFBRTtnQkFDVCxRQUFRLEVBQUUsS0FBSyxDQUFDLE1BQU07Z0JBQ3RCLE9BQU8sRUFBRSxLQUFLLENBQUMsS0FBSztnQkFDcEIsY0FBYyxFQUFFLEtBQUssQ0FBQyxRQUFRO2FBQ2pDO1NBQ0osQ0FDSixDQUFBO1FBRUgsdUZBQXVGO1FBQ3ZGLG9GQUFvRjtRQUNwRixpRUFBaUU7UUFDakUsRUFBRTtRQUNGLElBQUkscUJBQXFCLEdBQUcsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNuRixZQUFZLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXO1lBQzdDLFlBQVksRUFBRSx3Q0FBd0M7WUFDdEQsVUFBVSxFQUFFO2dCQUNSLFdBQVcsRUFBRSxLQUFLLENBQUMsTUFBTTtnQkFDekIsUUFBUSxFQUFFLFlBQVk7Z0JBQ3RCLE1BQU0sRUFBRSxTQUFTO2dCQUNqQixNQUFNLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2xCLFlBQVksRUFBRSxJQUFJO2dCQUNsQixhQUFhLEVBQUUsS0FBSztnQkFDcEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxLQUFLO2dCQUNwQixVQUFVLEVBQUUsS0FBSyxDQUFDLFFBQVE7YUFDN0I7U0FDSixDQUFDLENBQUE7UUFDRixJQUFJLFFBQVEsR0FBRyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEQsbUZBQW1GO1FBRW5GLElBQUksQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBRXZDLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtZQUNuQixJQUFJO2dCQUNBLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDekUsSUFBSSxDQUFDLGtCQUFrQixHQUFHLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQTtnQkFDckQsSUFBSSxDQUFDLGNBQWMsR0FBRyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQTtnQkFDcEQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFBO2dCQUMxRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFBO2dCQUV0RCx1RkFBdUY7Z0JBQ3ZGLHdGQUF3RjtnQkFDeEYsb0ZBQW9GO2dCQUNwRiwrQ0FBK0M7YUFFbEQ7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDUix5RkFBeUY7YUFDNUY7U0FDSDthQUFNO1lBQ0osSUFBSSxDQUFDLGtCQUFrQixHQUFHLGVBQWUsQ0FBQztZQUMxQyxJQUFJLENBQUMsY0FBYyxHQUFHLGVBQWUsQ0FBQztZQUN0QyxJQUFJLENBQUUsaUJBQWlCLEdBQUcsZUFBZSxDQUFDO1lBQzFDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxlQUFlLENBQUM7U0FDL0M7SUFDSCxDQUFDO0NBQ047QUF2RkQsb0NBdUZDIiwic291cmNlc0NvbnRlbnQiOlsiLyogwqkgMjAyMiBBbWF6b24gV2ViIFNlcnZpY2VzLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFNpbXBsZUlPVCBwcm9qZWN0LlxuICogQXV0aG9yOiBSYW1pbiBGaXJvb3p5ZSAoZnJhbWluQGFtYXpvbi5jb20pXG4qL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IGlhbSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1pYW0nKVxuaW1wb3J0IGxhbWJkYSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnKVxuaW1wb3J0IGVjMiA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1lYzInKVxuaW1wb3J0IHsgQ29tbW9uIH0gZnJvbSAnLi9jb21tb24nXG5pbXBvcnQge0NES1RpbWVzdHJlYW19IGZyb20gXCIuL2Nka190aW1lc3RyZWFtXCI7XG5pbXBvcnQge0NES0lhbX0gZnJvbSBcIi4vY2RrX2lhbVwiO1xuaW1wb3J0IHtDREtMYW1iZGFMYXllcn0gZnJvbSBcIi4vY2RrX2xhbWJkYWxheWVyXCI7XG5jb25zdCBwYXRoID0gcmVxdWlyZSggXCJwYXRoXCIgKTtcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuXG5pbnRlcmZhY2UgSVN0YXRpY0lPVFByb3BzIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrUHJvcHMge1xuICAgIHByZWZpeDogc3RyaW5nLFxuICAgIHN0YWdlOiBzdHJpbmcsXG4gICAgdXVpZDogc3RyaW5nLFxuICAgIGxvZ0xldmVsOiBzdHJpbmcsXG4gICAgdnBjOiBlYzIuSVZwYyxcbiAgICBpYW06IENES0lhbSxcbiAgICBsYXllcjogQ0RLTGFtYmRhTGF5ZXIsXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59XG5cbmV4cG9ydCBjbGFzcyBDREtTdGF0aWNJT1QgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuXG4gICAgcHVibGljIGluaXRSZXNwb25zZTogc3RyaW5nO1xuICAgIHB1YmxpYyBpb3RNb25pdG9yRW5kcG9pbnQ6IHN0cmluZztcbiAgICBwdWJsaWMgaW90U2V0dXBMYW1iZGE6IGxhbWJkYS5TaW5nbGV0b25GdW5jdGlvbjtcbiAgICBwdWJsaWMgaW90Q2VydEtleU5hbWU6IHN0cmluZztcbiAgICBwdWJsaWMgaW90UHJpdmF0ZUtleU5hbWU6IHN0cmluZztcbiAgICBwdWJsaWMgaW90TW9uaXRvclBvbGljeU5hbWU6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJU3RhdGljSU9UUHJvcHMpXG4gICAge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgICAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgICAgIGxldCBzb3VyY2VQYXRoID0gcGF0aC5yZXNvbHZlKFwiLi9saWIvbGFtYmRhX3NyYy9pb3Rfc3RhdGljX3NldHVwXCIpO1xuXG4gICAgICAgICAgLy8gRmlyc3QsIHdlIGNyZWF0ZSBhIHNpbmdsZXRvbiBsYW1iZGEgdGhhdCBjYW4gY3JlYXRlIHRoZSBJT1QgdGhpbmdzIHdlIG5lZWQuXG4gICAgICAgICAgLy8gVGhlbiB3ZSBjcmVhdGUgYSBjdXN0b20gQ0ZOIHJlc291cmNlIHRvIGludm9rZSBpdC4gVGhpcyB3aWxsIGJlIHVzZWQgYnkgQ0RLIHRvXG4gICAgICAgICAgLy8gaW5zdGFudGlhdGUgd2hhdCBpdCBuZWVkcyAoYW5kIGRlbGV0ZSB0aGluZ3Mgd2hlbiBpdCdzIHRpbWUgdG8gY2xlYW4pXG4gICAgICAgICAgLy8gVGhlIGxpYnJhcmllcyBuZWVkZWQgYnkgdGhlIExhbWJkYSBhcmUgaW4gdGhlIGxheWVyIGFzc2lnbmVkIHRvIHRoZSBsYW1iZGFcbiAgICAgICAgICAvLyBhbmQgd2lsbCBiZSBzaGFyZWQgYXQgcnVudGltZSBieSBJT1QgVGhpbmcgY3JlYXRpb24gbWVjaGFuaXNtcy5cbiAgICAgICAgICAvL1xuXG4gICAgICAgICAgdGhpcy5pb3RTZXR1cExhbWJkYSA9IG5ldyBsYW1iZGEuU2luZ2xldG9uRnVuY3Rpb24odGhpcywgXCJpb3Rfc2V0dXBfc2luZ2xldG9uXCIsXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkdjQoKSxcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgICAgICAgICAgICAgICAgcnVudGltZTogQ29tbW9uLnB5dGhvblJ1bnRpbWVWZXJzaW9uKCksXG4gICAgICAgICAgICAgICAgICAgIHJvbGU6IHByb3BzLmlhbS5pb3RMYW1iZGFGdWxsQWNjZXNzUm9sZSxcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXJzOiBwcm9wcy5sYXllci5hbGxMYXllcnMsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IG5ldyBsYW1iZGEuQXNzZXRDb2RlKHNvdXJjZVBhdGgpLFxuICAgICAgICAgICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJQUkVGSVhcIjogcHJvcHMucHJlZml4LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJTVEFHRVwiOiBwcm9wcy5zdGFnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiSU9UX0xPR0xFVkVMXCI6IHByb3BzLmxvZ0xldmVsXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApXG5cbiAgICAgICAgICAvLyBOb3cgd2UgY3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2UgdGhhdCByZWxpZXMgb24gdGhlIGxhbWJkYSB0byBjcmVhdGUgd2hhdCBpcyBuZWVkZWRcbiAgICAgICAgICAvLyBkdXJpbmcgQ0RLIHNldHVwLiBOT1RFOiB3ZSBzcGVjaWZ5IHRoZSAncmVzb3VyY2VUeXBlJyBhcyBhIG5hbWUgc28gQ2xvdWRGb3JtYXRpb25cbiAgICAgICAgICAvLyBjYW4gcHJvcGVybHkgdXBkYXRlIGl0IHdpdGhvdXQgZ2V0dGluZyBpbnRvIGEgZGVwZW5kZW5jeSBsb29wLlxuICAgICAgICAgIC8vXG4gICAgICAgICAgbGV0IGlvdEluaXRpYWxpemVSZXNvdXJjZSA9IG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgXCJpb3Rfc3RhdGljX2luaXRfcmVzb3VyY2VcIiwge1xuICAgICAgICAgICAgc2VydmljZVRva2VuOiB0aGlzLmlvdFNldHVwTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgICAgICAgcmVzb3VyY2VUeXBlOiBcIkN1c3RvbTo6c2ltcGxlaW90X3N0YXRpY19pbml0X3Jlc291cmNlXCIsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgJ05hbWVzcGFjZSc6IHByb3BzLnByZWZpeCxcbiAgICAgICAgICAgICAgICAnQWN0aW9uJzogJ2luaXRpYWxpemUnLFxuICAgICAgICAgICAgICAgICdOYW1lJzogJ21vbml0b3InLFxuICAgICAgICAgICAgICAgICdVdWlkJzogcHJvcHMudXVpZCxcbiAgICAgICAgICAgICAgICAnQ2VydHNJblNTTSc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ0NlcnRzSW5saW5lJzogZmFsc2UsXG4gICAgICAgICAgICAgICAgJ1N0YWdlJzogcHJvcHMuc3RhZ2UsXG4gICAgICAgICAgICAgICAgJ0xvZ0xldmVsJzogcHJvcHMubG9nTGV2ZWxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgbGV0IHJlc3BvbnNlID0gaW90SW5pdGlhbGl6ZVJlc291cmNlLmdldEF0dChcIlJlc3BvbnNlXCIpO1xuICAgICAgICAvL2NvbnNvbGUubG9nKFwiR290IHJlc3BvbnNlIGZyb20gSU9UIExhbWJkYSBpbml0aWFsaXphdGlvbjogXCIgKyB0aGlzLmluaXRSZXNwb25zZSk7XG5cbiAgICAgICAgdGhpcy5pbml0UmVzcG9uc2UgPSByZXNwb25zZS50b1N0cmluZygpXG5cbiAgICAgICAgaWYgKHRoaXMuaW5pdFJlc3BvbnNlKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGxldCBpb3RSZXNwb25zZSA9IEpTT04ucGFyc2UodGhpcy5pbml0UmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiR290IHJlc3BvbnNlIGZyb20gSU9UIGN1c3RvbSBjcmVhdGU6IFwiICsgdGhpcy5pbml0UmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIHRoaXMuaW90TW9uaXRvckVuZHBvaW50ID0gaW90UmVzcG9uc2VbJ2lvdF9lbmRwb2ludCddXG4gICAgICAgICAgICAgICAgdGhpcy5pb3RDZXJ0S2V5TmFtZSA9IGlvdFJlc3BvbnNlWydpb3RfY2VydGtleW5hbWUnXVxuICAgICAgICAgICAgICAgIHRoaXMuaW90UHJpdmF0ZUtleU5hbWUgPSBpb3RSZXNwb25zZVsnaW90X3ByaXZhdGVrZXluYW1lJ11cbiAgICAgICAgICAgICAgICB0aGlzLmlvdE1vbml0b3JQb2xpY3lOYW1lID0gaW90UmVzcG9uc2VbJ3BvbGljeV9uYW1lJ11cblxuICAgICAgICAgICAgICAgIC8vIE5PVEUgTk9URSBOT1RFOiBpbiBkZXYgbW9kZSB0aGVzZSBzZXR0aW5ncyBzaG91bGQgYmUgc2F2ZWQgaW4gYSBkYXRhYmFzZSBzbyB0aGUgbmV4dFxuICAgICAgICAgICAgICAgIC8vIHRlYW0gbWVtYmVyIHdobyBjb21lcyB0byBwbGF5IGdldHMgdGhlbSBkb3dubG9hZGVkIHRvIHRoZWlyIHN5c3RlbSBzbyB0aGV5IGNhbiBhY2Nlc3NcbiAgICAgICAgICAgICAgICAvLyBJT1QgY2VydHMsIGV0Yy4gV2UgY291bGQgbW92ZSB0aGVtIHRvIFNlY3JldHNNYW5hZ2VyLCBidXQgdGhlcmUgaXMgYSA0MEsgbGltaXQgdG9cbiAgICAgICAgICAgICAgICAvLyBzZWNyZXRzIGFuZCB0aGVyZSdzIGEgcmlzayB3ZSBtaWdodCBydW4gb3V0LlxuXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgLy8gZHVyaW5nIGJ1aWxkIHBoYXNlLCBwYXJzaW5nIEpTT04gY2FuIHRocm93IGFuIGV4Y2VwdGlvbiwgc28gd2UgY2F0Y2ggaXQgYW5kIGlnbm9yZSBpdC5cbiAgICAgICAgICAgIH1cbiAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmlvdE1vbml0b3JFbmRwb2ludCA9IFwiKiogaW52YWxpZCAqKlwiO1xuICAgICAgICAgICAgdGhpcy5pb3RDZXJ0S2V5TmFtZSA9IFwiKiogaW52YWxpZCAqKlwiO1xuICAgICAgICAgICAgdGhpcy4gaW90UHJpdmF0ZUtleU5hbWUgPSBcIioqIGludmFsaWQgKipcIjtcbiAgICAgICAgICAgIHRoaXMuaW90TW9uaXRvclBvbGljeU5hbWUgPSBcIioqIGludmFsaWQgKipcIjtcbiAgICAgICAgfVxuICAgICAgfVxufVxuIl19