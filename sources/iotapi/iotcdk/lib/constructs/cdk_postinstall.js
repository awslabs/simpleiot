"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKPostInstall = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
 *
 * This is a placeholder for any custom 'post-install' steps that needs to be
 * taken, specific to this install.
 *
 * You can use this to do any sort of post-install cleanup, and load any custom CloudFormation
 * templates that you need to run.
 *
 * You can add any extra CDK material, or uncomment the following and have it import
 * a custom CFN template.
 * More information here: https://docs.aws.amazon.com/cdk/latest/guide/use_cfn_template.html
*/
const cdk = require("aws-cdk-lib");
const common_1 = require("./common");
class CDKPostInstall extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        this._props = props; // make TS unused param complaints go away.
        // const template = new cfninc.CfnInclude(this, 'PostInstallTemplate', {
        //   templateFile: 'my-post-install-template.json',
        // });
    }
}
exports.CDKPostInstall = CDKPostInstall;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX3Bvc3RpbnN0YWxsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX3Bvc3RpbnN0YWxsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7Ozs7Ozs7Ozs7OztFQWNFO0FBQ0YsbUNBQW1DO0FBRW5DLHFDQUFnQztBQVFoQyxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsV0FBVztJQUcvQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakIsZUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRWhDLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsMkNBQTJDO1FBR3BFLHdFQUF3RTtRQUN4RSxtREFBbUQ7UUFDbkQsTUFBTTtJQUNSLENBQUM7Q0FDRjtBQWRELHdDQWNDIiwic291cmNlc0NvbnRlbnQiOlsiLyogwqkgMjAyMiBBbWF6b24gV2ViIFNlcnZpY2VzLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFNpbXBsZUlPVCBwcm9qZWN0LlxuICogQXV0aG9yOiBSYW1pbiBGaXJvb3p5ZSAoZnJhbWluQGFtYXpvbi5jb20pXG4gKlxuICogVGhpcyBpcyBhIHBsYWNlaG9sZGVyIGZvciBhbnkgY3VzdG9tICdwb3N0LWluc3RhbGwnIHN0ZXBzIHRoYXQgbmVlZHMgdG8gYmVcbiAqIHRha2VuLCBzcGVjaWZpYyB0byB0aGlzIGluc3RhbGwuXG4gKlxuICogWW91IGNhbiB1c2UgdGhpcyB0byBkbyBhbnkgc29ydCBvZiBwb3N0LWluc3RhbGwgY2xlYW51cCwgYW5kIGxvYWQgYW55IGN1c3RvbSBDbG91ZEZvcm1hdGlvblxuICogdGVtcGxhdGVzIHRoYXQgeW91IG5lZWQgdG8gcnVuLlxuICpcbiAqIFlvdSBjYW4gYWRkIGFueSBleHRyYSBDREsgbWF0ZXJpYWwsIG9yIHVuY29tbWVudCB0aGUgZm9sbG93aW5nIGFuZCBoYXZlIGl0IGltcG9ydFxuICogYSBjdXN0b20gQ0ZOIHRlbXBsYXRlLlxuICogTW9yZSBpbmZvcm1hdGlvbiBoZXJlOiBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vY2RrL2xhdGVzdC9ndWlkZS91c2VfY2ZuX3RlbXBsYXRlLmh0bWxcbiovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge0NvbW1vbn0gZnJvbSBcIi4vY29tbW9uXCI7XG4vLyBpbXBvcnQgKiBhcyBjZm5pbmMgZnJvbSAnYXdzLWNkay1saWIvY2xvdWRmb3JtYXRpb24taW5jbHVkZSc7XG5cbmludGVyZmFjZSBJUG9zdEluc3RhbGxQcm9wcyBleHRlbmRzIGNkay5OZXN0ZWRTdGFja1Byb3BzIHtcbiAgICAvLyBBZGQgZXh0cmEgcGFyYW1zIHlvdSB3YW50IHRvIHBhc3MgZG93biBoZXJlLi4uXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59XG5cbmV4cG9ydCBjbGFzcyBDREtQb3N0SW5zdGFsbCBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG4gICAgcHJpdmF0ZSBfcHJvcHM6IElQb3N0SW5zdGFsbFByb3BzO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IElQb3N0SW5zdGFsbFByb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgICAgIENvbW1vbi5hZGRUYWdzKHRoaXMsIHByb3BzLnRhZ3MpXG5cbiAgICAgICAgdGhpcy5fcHJvcHMgPSBwcm9wczsgLy8gbWFrZSBUUyB1bnVzZWQgcGFyYW0gY29tcGxhaW50cyBnbyBhd2F5LlxuXG5cbiAgICAvLyBjb25zdCB0ZW1wbGF0ZSA9IG5ldyBjZm5pbmMuQ2ZuSW5jbHVkZSh0aGlzLCAnUG9zdEluc3RhbGxUZW1wbGF0ZScsIHtcbiAgICAvLyAgIHRlbXBsYXRlRmlsZTogJ215LXBvc3QtaW5zdGFsbC10ZW1wbGF0ZS5qc29uJyxcbiAgICAvLyB9KTtcbiAgfVxufVxuIl19