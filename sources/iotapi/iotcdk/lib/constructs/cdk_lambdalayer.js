"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKLambdaLayer = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
 *
 * IMPORTANT:
 *
 * If upgrading the python version, you need to make sure several things align:
 *
 * 1. Before you even start, make sure the version of Python you want is supported by lambda.
 *    Check here for the latest list of runtimes supported by Lambda:
 *        https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
 * 2. Next, make sure Psycopg2 is available *ON AWS*. Easiest way is to check here:
 *    https://github.com/jkehler/awslambda-psycopg2 and also check the psycopg2 library's issues as to which
 *    version it's been tested against. For example, as of October 2021 upgrading to Python3.9 wasn't quite
 *    supported yet: https://github.com/psycopg/psycopg2/issues/1099. To verify, create a sample lambda and try it out.
 *
 * 3. Once you're sure it's compatible, snag the pre-built version at
 *    https://github.com/jkehler/awslambda-psycopg2 or build it from source on an
 *    EC2 instance.
 * 4. Copy the distribution into the
 *    simpleiot/sources/iotapi/iotcdk/lib/lambda_src/layers/iot_import_layer/python/lib/python{version}/site-packages/psycopg2
 *    directory. Make sure the "python{version}" is properly renamed, for example, "python3.8" is the right folder
 *    name.
 * 5. There is one file in the repos that uses a soft symbolic link pointing at the right path. The path
 *    includes the python version in the link, so that needs to be updated. In simpleiot/sources/iotapi/db there is
 *    a directory called "iotapp" this links to the lambda layer source directory.
 *
 *        iotapp -> ../iotcdk/lib/lambda_src/layers/iot_app_layer/python/lib/python{version}/site-packages/iotapp
 *
 * Under MacOS, you can change the link by deleteing the iotapp link and re-creating it to point at the proper
 * python version before doing a database load. For example, to point at python3.8:
 *
 * % cd simpleiot/sources/iotapi/db
 * % ls -al
 * % rm ./iotapp
 * % ln -s ../iotcdk/lib/lambda_src/layers/iot_app_layer/python/lib/python3.8/site-packages/iotapp .
 *
 * After this you can run the 'invoke dbsetup --team {my-team}' command and have it use the new python version.
 *
 * 6. Once this is done, now you need to change the Python version in the pythonRuntimeVersion function in  common.ts
 *    that is imported by other stacks.
 *
 * 7. Now you should be able to deploy the system with that version.
*/
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const common_1 = require("./common");
class CDKLambdaLayer extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // These layers are needed by ALL lambdas. We create
        let appLayerVersionName = props.prefix + "_app_layer";
        this.appLayer = new lambda.LayerVersion(this, "lambda_app_layer", {
            layerVersionName: appLayerVersionName,
            description: "DB shared application functions",
            compatibleRuntimes: [common_1.Common.pythonRuntimeVersion()],
            code: new lambda.AssetCode("./lib/lambda_src/layers/iot_app_layer/")
        });
        let importLayerVersionName = props.prefix + "_import_layer";
        this.importLayer = new lambda.LayerVersion(this, "lambda_import_layer", {
            layerVersionName: importLayerVersionName,
            description: "Python imports for access to RDS",
            compatibleRuntimes: [common_1.Common.pythonRuntimeVersion()],
            code: new lambda.AssetCode("./lib/lambda_src/layers/iot_import_layer/out/")
        });
        this.allLayers = [this.appLayer, this.importLayer];
    }
}
exports.CDKLambdaLayer = CDKLambdaLayer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2xhbWJkYWxheWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX2xhbWJkYWxheWVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQTRDRTtBQUNGLG1DQUFtQztBQUduQyxpREFBaUQ7QUFFakQscUNBQWdDO0FBU2hDLE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBTS9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFFOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMsb0RBQW9EO1FBQ3BELElBQUksbUJBQW1CLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUE7UUFFckQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzlELGdCQUFnQixFQUFFLG1CQUFtQjtZQUNyQyxXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLGtCQUFrQixFQUFFLENBQUUsZUFBTSxDQUFDLG9CQUFvQixFQUFFLENBQUU7WUFDckQsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyx3Q0FBd0MsQ0FBQztTQUN2RSxDQUFDLENBQUM7UUFFSCxJQUFJLHNCQUFzQixHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsZUFBZSxDQUFBO1FBRTNELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNwRSxnQkFBZ0IsRUFBRSxzQkFBc0I7WUFDeEMsV0FBVyxFQUFFLGtDQUFrQztZQUMvQyxrQkFBa0IsRUFBRSxDQUFFLGVBQU0sQ0FBQyxvQkFBb0IsRUFBRSxDQUFFO1lBQ3JELElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsK0NBQStDLENBQUM7U0FDOUUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7Q0FDSjtBQWhDRCx3Q0FnQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKiDCqSAyMDIyIEFtYXpvbiBXZWIgU2VydmljZXMsIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogU2ltcGxlSU9UIHByb2plY3QuXG4gKiBBdXRob3I6IFJhbWluIEZpcm9venllIChmcmFtaW5AYW1hem9uLmNvbSlcbiAqXG4gKiBJTVBPUlRBTlQ6XG4gKlxuICogSWYgdXBncmFkaW5nIHRoZSBweXRob24gdmVyc2lvbiwgeW91IG5lZWQgdG8gbWFrZSBzdXJlIHNldmVyYWwgdGhpbmdzIGFsaWduOlxuICpcbiAqIDEuIEJlZm9yZSB5b3UgZXZlbiBzdGFydCwgbWFrZSBzdXJlIHRoZSB2ZXJzaW9uIG9mIFB5dGhvbiB5b3Ugd2FudCBpcyBzdXBwb3J0ZWQgYnkgbGFtYmRhLlxuICogICAgQ2hlY2sgaGVyZSBmb3IgdGhlIGxhdGVzdCBsaXN0IG9mIHJ1bnRpbWVzIHN1cHBvcnRlZCBieSBMYW1iZGE6XG4gKiAgICAgICAgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2xhbWJkYS9sYXRlc3QvZGcvbGFtYmRhLXJ1bnRpbWVzLmh0bWxcbiAqIDIuIE5leHQsIG1ha2Ugc3VyZSBQc3ljb3BnMiBpcyBhdmFpbGFibGUgKk9OIEFXUyouIEVhc2llc3Qgd2F5IGlzIHRvIGNoZWNrIGhlcmU6XG4gKiAgICBodHRwczovL2dpdGh1Yi5jb20vamtlaGxlci9hd3NsYW1iZGEtcHN5Y29wZzIgYW5kIGFsc28gY2hlY2sgdGhlIHBzeWNvcGcyIGxpYnJhcnkncyBpc3N1ZXMgYXMgdG8gd2hpY2hcbiAqICAgIHZlcnNpb24gaXQncyBiZWVuIHRlc3RlZCBhZ2FpbnN0LiBGb3IgZXhhbXBsZSwgYXMgb2YgT2N0b2JlciAyMDIxIHVwZ3JhZGluZyB0byBQeXRob24zLjkgd2Fzbid0IHF1aXRlXG4gKiAgICBzdXBwb3J0ZWQgeWV0OiBodHRwczovL2dpdGh1Yi5jb20vcHN5Y29wZy9wc3ljb3BnMi9pc3N1ZXMvMTA5OS4gVG8gdmVyaWZ5LCBjcmVhdGUgYSBzYW1wbGUgbGFtYmRhIGFuZCB0cnkgaXQgb3V0LlxuICpcbiAqIDMuIE9uY2UgeW91J3JlIHN1cmUgaXQncyBjb21wYXRpYmxlLCBzbmFnIHRoZSBwcmUtYnVpbHQgdmVyc2lvbiBhdFxuICogICAgaHR0cHM6Ly9naXRodWIuY29tL2prZWhsZXIvYXdzbGFtYmRhLXBzeWNvcGcyIG9yIGJ1aWxkIGl0IGZyb20gc291cmNlIG9uIGFuXG4gKiAgICBFQzIgaW5zdGFuY2UuXG4gKiA0LiBDb3B5IHRoZSBkaXN0cmlidXRpb24gaW50byB0aGVcbiAqICAgIHNpbXBsZWlvdC9zb3VyY2VzL2lvdGFwaS9pb3RjZGsvbGliL2xhbWJkYV9zcmMvbGF5ZXJzL2lvdF9pbXBvcnRfbGF5ZXIvcHl0aG9uL2xpYi9weXRob257dmVyc2lvbn0vc2l0ZS1wYWNrYWdlcy9wc3ljb3BnMlxuICogICAgZGlyZWN0b3J5LiBNYWtlIHN1cmUgdGhlIFwicHl0aG9ue3ZlcnNpb259XCIgaXMgcHJvcGVybHkgcmVuYW1lZCwgZm9yIGV4YW1wbGUsIFwicHl0aG9uMy44XCIgaXMgdGhlIHJpZ2h0IGZvbGRlclxuICogICAgbmFtZS5cbiAqIDUuIFRoZXJlIGlzIG9uZSBmaWxlIGluIHRoZSByZXBvcyB0aGF0IHVzZXMgYSBzb2Z0IHN5bWJvbGljIGxpbmsgcG9pbnRpbmcgYXQgdGhlIHJpZ2h0IHBhdGguIFRoZSBwYXRoXG4gKiAgICBpbmNsdWRlcyB0aGUgcHl0aG9uIHZlcnNpb24gaW4gdGhlIGxpbmssIHNvIHRoYXQgbmVlZHMgdG8gYmUgdXBkYXRlZC4gSW4gc2ltcGxlaW90L3NvdXJjZXMvaW90YXBpL2RiIHRoZXJlIGlzXG4gKiAgICBhIGRpcmVjdG9yeSBjYWxsZWQgXCJpb3RhcHBcIiB0aGlzIGxpbmtzIHRvIHRoZSBsYW1iZGEgbGF5ZXIgc291cmNlIGRpcmVjdG9yeS5cbiAqXG4gKiAgICAgICAgaW90YXBwIC0+IC4uL2lvdGNkay9saWIvbGFtYmRhX3NyYy9sYXllcnMvaW90X2FwcF9sYXllci9weXRob24vbGliL3B5dGhvbnt2ZXJzaW9ufS9zaXRlLXBhY2thZ2VzL2lvdGFwcFxuICpcbiAqIFVuZGVyIE1hY09TLCB5b3UgY2FuIGNoYW5nZSB0aGUgbGluayBieSBkZWxldGVpbmcgdGhlIGlvdGFwcCBsaW5rIGFuZCByZS1jcmVhdGluZyBpdCB0byBwb2ludCBhdCB0aGUgcHJvcGVyXG4gKiBweXRob24gdmVyc2lvbiBiZWZvcmUgZG9pbmcgYSBkYXRhYmFzZSBsb2FkLiBGb3IgZXhhbXBsZSwgdG8gcG9pbnQgYXQgcHl0aG9uMy44OlxuICpcbiAqICUgY2Qgc2ltcGxlaW90L3NvdXJjZXMvaW90YXBpL2RiXG4gKiAlIGxzIC1hbFxuICogJSBybSAuL2lvdGFwcFxuICogJSBsbiAtcyAuLi9pb3RjZGsvbGliL2xhbWJkYV9zcmMvbGF5ZXJzL2lvdF9hcHBfbGF5ZXIvcHl0aG9uL2xpYi9weXRob24zLjgvc2l0ZS1wYWNrYWdlcy9pb3RhcHAgLlxuICpcbiAqIEFmdGVyIHRoaXMgeW91IGNhbiBydW4gdGhlICdpbnZva2UgZGJzZXR1cCAtLXRlYW0ge215LXRlYW19JyBjb21tYW5kIGFuZCBoYXZlIGl0IHVzZSB0aGUgbmV3IHB5dGhvbiB2ZXJzaW9uLlxuICpcbiAqIDYuIE9uY2UgdGhpcyBpcyBkb25lLCBub3cgeW91IG5lZWQgdG8gY2hhbmdlIHRoZSBQeXRob24gdmVyc2lvbiBpbiB0aGUgcHl0aG9uUnVudGltZVZlcnNpb24gZnVuY3Rpb24gaW4gIGNvbW1vbi50c1xuICogICAgdGhhdCBpcyBpbXBvcnRlZCBieSBvdGhlciBzdGFja3MuXG4gKlxuICogNy4gTm93IHlvdSBzaG91bGQgYmUgYWJsZSB0byBkZXBsb3kgdGhlIHN5c3RlbSB3aXRoIHRoYXQgdmVyc2lvbi5cbiovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgaWFtID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWlhbScpXG5pbXBvcnQgbGFtYmRhID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWxhbWJkYScpXG5pbXBvcnQge0NES0lhbX0gZnJvbSBcIi4vY2RrX2lhbVwiO1xuaW1wb3J0IHtDb21tb259IGZyb20gXCIuL2NvbW1vblwiO1xuXG5pbnRlcmZhY2UgSUxhbWJkYUxheWVyUHJvcHMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2tQcm9wcyB7XG4gICAgcHJlZml4IDogc3RyaW5nLFxuICAgIHV1aWQ6IHN0cmluZyxcbiAgICBzdGFnZTogc3RyaW5nLFxuICAgIHRhZ3M6IHtbbmFtZTogc3RyaW5nXTogYW55fVxufVxuXG5leHBvcnQgY2xhc3MgQ0RLTGFtYmRhTGF5ZXIgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuXG4gICAgcHVibGljIGltcG9ydExheWVyOiBsYW1iZGEuTGF5ZXJWZXJzaW9uO1xuICAgIHB1YmxpYyBhcHBMYXllcjogbGFtYmRhLkxheWVyVmVyc2lvbjtcbiAgICBwdWJsaWMgYWxsTGF5ZXJzOiBsYW1iZGEuTGF5ZXJWZXJzaW9uW107XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSUxhbWJkYUxheWVyUHJvcHMpXG4gICAge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgICAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgICAgIC8vIFRoZXNlIGxheWVycyBhcmUgbmVlZGVkIGJ5IEFMTCBsYW1iZGFzLiBXZSBjcmVhdGVcbiAgICAgICAgbGV0IGFwcExheWVyVmVyc2lvbk5hbWUgPSBwcm9wcy5wcmVmaXggKyBcIl9hcHBfbGF5ZXJcIlxuXG4gICAgICAgIHRoaXMuYXBwTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCBcImxhbWJkYV9hcHBfbGF5ZXJcIiwge1xuICAgICAgICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogYXBwTGF5ZXJWZXJzaW9uTmFtZSxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkRCIHNoYXJlZCBhcHBsaWNhdGlvbiBmdW5jdGlvbnNcIixcbiAgICAgICAgICAgIGNvbXBhdGlibGVSdW50aW1lczogWyBDb21tb24ucHl0aG9uUnVudGltZVZlcnNpb24oKSBdLFxuICAgICAgICAgICAgY29kZTogbmV3IGxhbWJkYS5Bc3NldENvZGUoXCIuL2xpYi9sYW1iZGFfc3JjL2xheWVycy9pb3RfYXBwX2xheWVyL1wiKVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgaW1wb3J0TGF5ZXJWZXJzaW9uTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2ltcG9ydF9sYXllclwiXG5cbiAgICAgICAgdGhpcy5pbXBvcnRMYXllciA9IG5ldyBsYW1iZGEuTGF5ZXJWZXJzaW9uKHRoaXMsIFwibGFtYmRhX2ltcG9ydF9sYXllclwiLCB7XG4gICAgICAgICAgICBsYXllclZlcnNpb25OYW1lOiBpbXBvcnRMYXllclZlcnNpb25OYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiUHl0aG9uIGltcG9ydHMgZm9yIGFjY2VzcyB0byBSRFNcIixcbiAgICAgICAgICAgIGNvbXBhdGlibGVSdW50aW1lczogWyBDb21tb24ucHl0aG9uUnVudGltZVZlcnNpb24oKSBdLFxuICAgICAgICAgICAgY29kZTogbmV3IGxhbWJkYS5Bc3NldENvZGUoXCIuL2xpYi9sYW1iZGFfc3JjL2xheWVycy9pb3RfaW1wb3J0X2xheWVyL291dC9cIilcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hbGxMYXllcnMgPSBbdGhpcy5hcHBMYXllciwgdGhpcy5pbXBvcnRMYXllcl07XG4gICAgfVxufSJdfQ==