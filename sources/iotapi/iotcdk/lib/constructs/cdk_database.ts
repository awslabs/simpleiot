/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import ec2 = require('aws-cdk-lib/aws-ec2')
import rds = require('aws-cdk-lib/aws-rds')
import iam = require('aws-cdk-lib/aws-iam')
import {ISecret, Secret} from 'aws-cdk-lib/aws-secretsmanager';
import {Common} from "./common"
import {CDKLambdaLayer} from "./cdk_lambdalayer";
import {CDKStaticIOT} from "./cdk_staticiot";
import {BlockDeviceVolume, Peer, Port} from "aws-cdk-lib/aws-ec2";
import {AuroraPostgresEngineVersion, PostgresEngineVersion} from "aws-cdk-lib/aws-rds";


interface IDatabaseProps extends cdk.NestedStackProps {
    prefix: string,
    useAurora: boolean,
    uuid: string,
    vpc: ec2.IVpc,
    myIp: string,
    postgresFullVersion: string,
    postgresMajorVersion: string,
    dbPort: string,
    httpsPort: string,
    dbUsername: string,
    dbPasswordKey: string,
    dbName: string,
    keypairName: string,
    maxGeneratedPasswordLength: number,
    tags: {[name: string]: any}
};


export class CDKDatabase extends cdk.NestedStack {
  public bastion: ec2.BastionHostLinux;
  public databaseCluster: rds.DatabaseCluster; // For Aurora use
  public databaseInstance: rds.DatabaseInstance;
  public dbSecurityGroup : ec2.ISecurityGroup;
  public databaseHostname : string;
  readonly databaseSecret: rds.DatabaseSecret;

  constructor(scope: Construct, id: string, props: IDatabaseProps) {
      super(scope, id);
      Common.addTags(this, props.tags)

      // console.log("Executing: Database stack with prefix: " + namePrefix)

      let bastionSecurityGroupName = props.prefix + "_bastion_ssh_sg";
      let bastionSecurityGroup = new ec2.SecurityGroup(this, "bastion_security_group",
          {
              vpc: props.vpc,
              securityGroupName: bastionSecurityGroupName,
              allowAllOutbound: true
          });

      // NOTE: we limit access to bastion host to the device this is running on.
      // This means any future access to the bastion host will require being from the same
      // IP address.
      //
      let ipWithCIDR = props.myIp + "/32";

      bastionSecurityGroup.addIngressRule(Peer.ipv4(ipWithCIDR), Port.tcp(22), "Incoming SSH")

      // We can have a custom security group. But the allow_from_any_ipv4() call below
      // does the same thing. So these are commented for now, but provided in case we need
      // to create a custom SG.
      //
      // Allow ingress from SSH - from any host. We can tighten this more to specific hosts
      // if need be.
      //
      // bastion_security_group.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(22), "SSH access")
      //
      // This is a bit too permissive. We're going to need to assign a different security group
      // for allowing rds to contact.

      let bastion_instance_name = props.prefix + "_db_bastion_host"
      this.bastion = new ec2.BastionHostLinux(this, "db_bastion_host", {
              vpc: props.vpc,
              blockDevices: [
                  {
                      deviceName: '/dev/xvda',
                      mappingEnabled: true,
                      volume: ec2.BlockDeviceVolume.ebs(20, {
                          deleteOnTermination: true,
                          volumeType: ec2.EbsDeviceVolumeType.STANDARD,
                          encrypted: true
                      })
                  }
              ],
              instanceName: bastion_instance_name,
              securityGroup: bastionSecurityGroup,
              subnetSelection: {subnetType: ec2.SubnetType.PUBLIC},
              instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO)
          }
      );

      // NOTE: the name of the keypair MUST be created manually using the AWS Console under EC2/Keypairs.
      // The name MUST match the name in the BASTION_SSH_EC2_KEYPAIR_NAME variable (see above).
      // The SSH file itself should be placed somewhere the DB importer can find it and then used for
      // doing a remote SSH into the bastion host so the database can be updated.
      // ALSO: don't forget to chmod 0400 the keypair .pem file once it's downloaded.

      this.bastion.instance.instance.addPropertyOverride("KeyName", props.keypairName);
      this.bastion.allowSshAccessFrom()

      // This adds ssh access from any IP address.
      // this.bastion.connections.allowFromAnyIpv4(ec2.Port.tcp(22), "SSH Access")

      let securityGroupName = props.prefix + "_db_sg";
      this.dbSecurityGroup = new ec2.SecurityGroup(this, "db_security_group",
          {
              vpc: props.vpc,
              securityGroupName: securityGroupName,
              allowAllOutbound: true
          }
      );

      // Allow ingress from Database and HTTPS so SSH bastion as well as lambdas can access it.

      this.dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(parseInt(props.dbPort)), "Database port")
      this.dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(parseInt(props.httpsPort)), "HTTPS port")

      // NOTE: for production, you'll want to further restrict the Security Group by limiting
      // which IP addresses are allowed to connect via SSH.

      // The database secret is generated here. To implement automatic secret rotation, more
      // information can be found here:
      // https://docs.aws.amazon.com/cdk/api/latest/docs/aws-secretsmanager-readme.html#rotating-database-credentials
      //
      this.databaseSecret = new rds.DatabaseSecret(this, 'db_secret', {
          username: props.dbUsername,
          secretName: props.dbPasswordKey
      });

      if (props.useAurora) {
          console.log("    - With Aurora/Postgres version: " + props.postgresFullVersion)
          this.databaseCluster = new rds.DatabaseCluster(this, "db_cluster",
              {
                  defaultDatabaseName: props.dbName,
                  engine: rds.DatabaseClusterEngine.auroraPostgres({
                      version: AuroraPostgresEngineVersion.of(
                          props.postgresFullVersion,
                          props.postgresMajorVersion
                      ),
                  }),
                  port: parseInt(props.dbPort),
                  removalPolicy: cdk.RemovalPolicy.DESTROY,
                  storageEncrypted: true,
                  credentials: rds.Credentials.fromSecret(this.databaseSecret),
                  instanceProps: {
                      instanceType: ec2.InstanceType.of(ec2.InstanceClass.MEMORY5, ec2.InstanceSize.LARGE),
                      vpc: props.vpc,
                      securityGroups: [this.dbSecurityGroup],
                      vpcSubnets: {
                          subnetType: ec2.SubnetType.PRIVATE
                      }
                  },
              }
          );
          this.databaseHostname = this.databaseCluster.clusterEndpoint.hostname;

      } else {

          // NOTE: we are using an RDS/Postgres instance instead of an AuroraPostgres instance so we can keep usage costs
          // for development inside the free tier range. This, however, will not scale well.
          // For production use, we should use the Aurora Version so it can auto-scale. But it will not have a
          // free tier option.
          //
          console.log("    - With RDS/Postgres version: " + props.postgresFullVersion)
          const engine = rds.DatabaseInstanceEngine.postgres({
              version: PostgresEngineVersion.of(
                  props.postgresFullVersion,
                  props.postgresMajorVersion)
          });

          this.databaseInstance = new rds.DatabaseInstance(this, 'db-instance', {
              vpc: props.vpc,
              databaseName: props.dbName,
              vpcSubnets: {
                  subnetType: ec2.SubnetType.PRIVATE
              },
              port: parseInt(props.dbPort),
              engine: engine,
              instanceType: ec2.InstanceType.of(
                  ec2.InstanceClass.BURSTABLE3,
                  ec2.InstanceSize.MICRO
              ),
              credentials: rds.Credentials.fromSecret(this.databaseSecret),
              securityGroups: [this.dbSecurityGroup],
              multiAz: false,
              storageEncrypted: true,
              allocatedStorage: 100,
              maxAllocatedStorage: 105,
              allowMajorVersionUpgrade: true,
              autoMinorVersionUpgrade: true,
              backupRetention: cdk.Duration.days(0),
              deleteAutomatedBackups: true,
              removalPolicy: cdk.RemovalPolicy.DESTROY,
              deletionProtection: false,
              publiclyAccessible: false,
          });

          this.databaseInstance.connections.allowFrom(this.bastion, ec2.Port.tcp(parseInt(props.dbPort)));
          this.databaseHostname = this.databaseInstance.instanceEndpoint.hostname;
      }
  }
}
