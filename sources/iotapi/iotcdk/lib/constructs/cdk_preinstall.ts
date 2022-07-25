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
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {Common} from "./common";
// import * as cfninc from 'aws-cdk-lib/cloudformation-include';

interface IPreInstallProps extends cdk.NestedStackProps {
    tags: {[name: string]: any}
    // Add extra params you want to pass down here...
}

export class CDKPreInstall extends cdk.NestedStack {
    private _props: IPreInstallProps;

    constructor(scope: Construct, id: string, props: IPreInstallProps) {
        super(scope, id);
        Common.addTags(this, props.tags)

        this._props = props; // make TS unused param complaints go away.

        // const template = new cfninc.CfnInclude(this, 'PreInstallTemplate', {
    //   templateFile: 'my-pre-install-template.json',
    // });
  }
}
