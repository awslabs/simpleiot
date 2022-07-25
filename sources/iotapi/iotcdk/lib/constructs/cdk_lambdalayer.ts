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
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import iam = require('aws-cdk-lib/aws-iam')
import lambda = require('aws-cdk-lib/aws-lambda')
import {CDKIam} from "./cdk_iam";
import {Common} from "./common";

interface ILambdaLayerProps extends cdk.NestedStackProps {
    prefix : string,
    uuid: string,
    stage: string,
    tags: {[name: string]: any}
}

export class CDKLambdaLayer extends cdk.NestedStack {

    public importLayer: lambda.LayerVersion;
    public appLayer: lambda.LayerVersion;
    public allLayers: lambda.LayerVersion[];

    constructor(scope: Construct, id: string, props: ILambdaLayerProps)
    {
        super(scope, id);
        Common.addTags(this, props.tags)

        // These layers are needed by ALL lambdas. We create
        let appLayerVersionName = props.prefix + "_app_layer"

        this.appLayer = new lambda.LayerVersion(this, "lambda_app_layer", {
            layerVersionName: appLayerVersionName,
            description: "DB shared application functions",
            compatibleRuntimes: [ Common.pythonRuntimeVersion() ],
            code: new lambda.AssetCode("./lib/lambda_src/layers/iot_app_layer/")
        });

        let importLayerVersionName = props.prefix + "_import_layer"

        this.importLayer = new lambda.LayerVersion(this, "lambda_import_layer", {
            layerVersionName: importLayerVersionName,
            description: "Python imports for access to RDS",
            compatibleRuntimes: [ Common.pythonRuntimeVersion() ],
            code: new lambda.AssetCode("./lib/lambda_src/layers/iot_import_layer/out/")
        });

        this.allLayers = [this.appLayer, this.importLayer];
    }
}