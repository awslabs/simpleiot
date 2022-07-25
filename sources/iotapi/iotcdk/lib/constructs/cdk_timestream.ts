/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import iam = require('aws-cdk-lib/aws-iam')

import ts = require('aws-cdk-lib/aws-timestream')
import {Common} from "./common";
const path = require( "path" )

interface ITimestreamProps extends cdk.NestedStackProps {
    prefix : string,
    uuid: string,
    stage: string,
    tags: {[name: string]: any}
}

export class CDKTimestream extends cdk.NestedStack {

    public timestreamDatabase: ts.CfnDatabase;
    public timestreamIoTTable: ts.CfnTable;
    public databaseName: string;
    public tableName: string;

    constructor(scope: Construct,
                id: string, props: ITimestreamProps)
    {
        super(scope, id);
        Common.addTags(this, props.tags)

        this.databaseName = props.prefix + "_timestream_db";

        this.timestreamDatabase = new ts.CfnDatabase(this, "timestream_db", {
            databaseName: this.databaseName
        })

        this.tableName = props.prefix + "_timestream_table"

        this.timestreamIoTTable = new ts.CfnTable(this, "timestream_table", {
            databaseName: this.databaseName,
            tableName: this.tableName
        });

        // NOTE: the timestream table needs to wait until the timestream database has been created.
        //
        this.timestreamIoTTable.addDependsOn(this.timestreamDatabase);
    }
}
