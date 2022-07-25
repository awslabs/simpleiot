/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
/*
* Common utilities
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import lambda = require('aws-cdk-lib/aws-lambda')


export class Common {
    public static output(obj: Construct, name: string, value: string, desc: string) {
        if (value) {
            new cdk.CfnOutput(obj, name, {
                    value: value,
                    description: desc
                }
            ).overrideLogicalId(name)
        }
    }

    // Returns the python runtime version used for all lambda layers.
    //
    public static pythonRuntimeVersion() {
        return lambda.Runtime.PYTHON_3_8;
    }
    // Utility to add mulitple tags to a construct
    //
    public static addTags(construct: Construct, tags: { [ name: string ]: any }) {
        for (let key in tags) {
            let value = tags[key];
            cdk.Tags.of(construct).add(key, value);
        }
    }

    public static snakeToCamel(s: string){
        return s.replace(/(\_\w)/g, function(m){return m[1].toUpperCase();});
    }

    private static isLower(character: string) : boolean {
      return (character === character.toLowerCase()) && (character !== character.toUpperCase());
    }

    public static generatePassword(length: number,
                                   withUpper: boolean = false,
                                   withSymbol: boolean = false) : string
    {
    var haveUpper = false;
    var charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    if (withSymbol) {
        charSet += "!@#$%^&*()_+="
    }
    var result = Array.apply(null, Array(length)).map(function() {
        var one = charSet.charAt(Math.random() * charSet.length);
        if (withUpper && !haveUpper) {
            if (Common.isLower(one)) {
                one = one.toUpperCase();
                haveUpper = true;
            }
        }
        return one;
    }).join('');
    return result;
  }
}