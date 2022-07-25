"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKPreInstall = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
 *
 * This is a placeholder for any custom 'pre-install' steps that needs to be
 * taken, specific to this install.
 *
 * You can use this to set up the AWS account, and load any custom CloudFormation
 * templates that you need to run.
 *
 * You can add any extra CDK material, or uncomment the following and have it import
 * a custom CFN template.
 * More information here: https://docs.aws.amazon.com/cdk/latest/guide/use_cfn_template.html
*/
const cdk = require("aws-cdk-lib");
const common_1 = require("./common");
class CDKPreInstall extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        this._props = props; // make TS unused param complaints go away.
        // const template = new cfninc.CfnInclude(this, 'PreInstallTemplate', {
        //   templateFile: 'my-pre-install-template.json',
        // });
    }
}
exports.CDKPreInstall = CDKPreInstall;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX3ByZWluc3RhbGwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGtfcHJlaW5zdGFsbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7Ozs7Ozs7Ozs7RUFjRTtBQUNGLG1DQUFtQztBQUVuQyxxQ0FBZ0M7QUFRaEMsTUFBYSxhQUFjLFNBQVEsR0FBRyxDQUFDLFdBQVc7SUFHOUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF1QjtRQUM3RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLGVBQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUVoQyxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDLDJDQUEyQztRQUVoRSx1RUFBdUU7UUFDM0Usa0RBQWtEO1FBQ2xELE1BQU07SUFDUixDQUFDO0NBQ0Y7QUFiRCxzQ0FhQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIMKpIDIwMjIgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBTaW1wbGVJT1QgcHJvamVjdC5cbiAqIEF1dGhvcjogUmFtaW4gRmlyb296eWUgKGZyYW1pbkBhbWF6b24uY29tKVxuICpcbiAqIFRoaXMgaXMgYSBwbGFjZWhvbGRlciBmb3IgYW55IGN1c3RvbSAncHJlLWluc3RhbGwnIHN0ZXBzIHRoYXQgbmVlZHMgdG8gYmVcbiAqIHRha2VuLCBzcGVjaWZpYyB0byB0aGlzIGluc3RhbGwuXG4gKlxuICogWW91IGNhbiB1c2UgdGhpcyB0byBzZXQgdXAgdGhlIEFXUyBhY2NvdW50LCBhbmQgbG9hZCBhbnkgY3VzdG9tIENsb3VkRm9ybWF0aW9uXG4gKiB0ZW1wbGF0ZXMgdGhhdCB5b3UgbmVlZCB0byBydW4uXG4gKlxuICogWW91IGNhbiBhZGQgYW55IGV4dHJhIENESyBtYXRlcmlhbCwgb3IgdW5jb21tZW50IHRoZSBmb2xsb3dpbmcgYW5kIGhhdmUgaXQgaW1wb3J0XG4gKiBhIGN1c3RvbSBDRk4gdGVtcGxhdGUuXG4gKiBNb3JlIGluZm9ybWF0aW9uIGhlcmU6IGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvbGF0ZXN0L2d1aWRlL3VzZV9jZm5fdGVtcGxhdGUuaHRtbFxuKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7Q29tbW9ufSBmcm9tIFwiLi9jb21tb25cIjtcbi8vIGltcG9ydCAqIGFzIGNmbmluYyBmcm9tICdhd3MtY2RrLWxpYi9jbG91ZGZvcm1hdGlvbi1pbmNsdWRlJztcblxuaW50ZXJmYWNlIElQcmVJbnN0YWxsUHJvcHMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2tQcm9wcyB7XG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG4gICAgLy8gQWRkIGV4dHJhIHBhcmFtcyB5b3Ugd2FudCB0byBwYXNzIGRvd24gaGVyZS4uLlxufVxuXG5leHBvcnQgY2xhc3MgQ0RLUHJlSW5zdGFsbCBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG4gICAgcHJpdmF0ZSBfcHJvcHM6IElQcmVJbnN0YWxsUHJvcHM7XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSVByZUluc3RhbGxQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgICAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgICAgIHRoaXMuX3Byb3BzID0gcHJvcHM7IC8vIG1ha2UgVFMgdW51c2VkIHBhcmFtIGNvbXBsYWludHMgZ28gYXdheS5cblxuICAgICAgICAvLyBjb25zdCB0ZW1wbGF0ZSA9IG5ldyBjZm5pbmMuQ2ZuSW5jbHVkZSh0aGlzLCAnUHJlSW5zdGFsbFRlbXBsYXRlJywge1xuICAgIC8vICAgdGVtcGxhdGVGaWxlOiAnbXktcHJlLWluc3RhbGwtdGVtcGxhdGUuanNvbicsXG4gICAgLy8gfSk7XG4gIH1cbn1cbiJdfQ==