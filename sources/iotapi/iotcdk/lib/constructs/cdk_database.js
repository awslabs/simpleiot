"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKDatabase = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const rds = require("aws-cdk-lib/aws-rds");
const common_1 = require("./common");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const aws_rds_1 = require("aws-cdk-lib/aws-rds");
;
class CDKDatabase extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // console.log("Executing: Database stack with prefix: " + namePrefix)
        let bastionSecurityGroupName = props.prefix + "_bastion_ssh_sg";
        let bastionSecurityGroup = new ec2.SecurityGroup(this, "bastion_security_group", {
            vpc: props.vpc,
            securityGroupName: bastionSecurityGroupName,
            allowAllOutbound: true
        });
        // NOTE: we limit access to bastion host to the device this is running on.
        // This means any future access to the bastion host will require being from the same
        // IP address.
        //
        let ipWithCIDR = props.myIp + "/32";
        bastionSecurityGroup.addIngressRule(aws_ec2_1.Peer.ipv4(ipWithCIDR), aws_ec2_1.Port.tcp(22), "Incoming SSH");
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
        let bastion_instance_name = props.prefix + "_db_bastion_host";
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
            subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO)
        });
        // NOTE: the name of the keypair MUST be created manually using the AWS Console under EC2/Keypairs.
        // The name MUST match the name in the BASTION_SSH_EC2_KEYPAIR_NAME variable (see above).
        // The SSH file itself should be placed somewhere the DB importer can find it and then used for
        // doing a remote SSH into the bastion host so the database can be updated.
        // ALSO: don't forget to chmod 0400 the keypair .pem file once it's downloaded.
        this.bastion.instance.instance.addPropertyOverride("KeyName", props.keypairName);
        this.bastion.allowSshAccessFrom();
        // This adds ssh access from any IP address.
        // this.bastion.connections.allowFromAnyIpv4(ec2.Port.tcp(22), "SSH Access")
        let securityGroupName = props.prefix + "_db_sg";
        this.dbSecurityGroup = new ec2.SecurityGroup(this, "db_security_group", {
            vpc: props.vpc,
            securityGroupName: securityGroupName,
            allowAllOutbound: true
        });
        // Allow ingress from Database and HTTPS so SSH bastion as well as lambdas can access it.
        this.dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(parseInt(props.dbPort)), "Database port");
        this.dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(parseInt(props.httpsPort)), "HTTPS port");
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
            console.log("    - With Aurora/Postgres version: " + props.postgresFullVersion);
            this.databaseCluster = new rds.DatabaseCluster(this, "db_cluster", {
                defaultDatabaseName: props.dbName,
                engine: rds.DatabaseClusterEngine.auroraPostgres({
                    version: aws_rds_1.AuroraPostgresEngineVersion.of(props.postgresFullVersion, props.postgresMajorVersion),
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
            });
            this.databaseHostname = this.databaseCluster.clusterEndpoint.hostname;
        }
        else {
            // NOTE: we are using an RDS/Postgres instance instead of an AuroraPostgres instance so we can keep usage costs
            // for development inside the free tier range. This, however, will not scale well.
            // For production use, we should use the Aurora Version so it can auto-scale. But it will not have a
            // free tier option.
            //
            console.log("    - With RDS/Postgres version: " + props.postgresFullVersion);
            const engine = rds.DatabaseInstanceEngine.postgres({
                version: aws_rds_1.PostgresEngineVersion.of(props.postgresFullVersion, props.postgresMajorVersion)
            });
            this.databaseInstance = new rds.DatabaseInstance(this, 'db-instance', {
                vpc: props.vpc,
                databaseName: props.dbName,
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE
                },
                port: parseInt(props.dbPort),
                engine: engine,
                instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
                credentials: rds.Credentials.fromSecret(this.databaseSecret),
                securityGroups: [this.dbSecurityGroup],
                multiAz: false,
                storageEncrypted: true,
                allocatedStorage: props.allocatedStorage,
                maxAllocatedStorage: props.maxAllocatedStorage,
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
exports.CDKDatabase = CDKDatabase;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2RhdGFiYXNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX2RhdGFiYXNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0VBSUU7QUFDRixtQ0FBbUM7QUFFbkMsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUczQyxxQ0FBK0I7QUFHL0IsaURBQWtFO0FBQ2xFLGlEQUF1RjtBQXFCdEYsQ0FBQztBQUdGLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBUTlDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBcUI7UUFDM0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMsc0VBQXNFO1FBRXRFLElBQUksd0JBQXdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQztRQUNoRSxJQUFJLG9CQUFvQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQzNFO1lBQ0ksR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsaUJBQWlCLEVBQUUsd0JBQXdCO1lBQzNDLGdCQUFnQixFQUFFLElBQUk7U0FDekIsQ0FBQyxDQUFDO1FBRVAsMEVBQTBFO1FBQzFFLG9GQUFvRjtRQUNwRixjQUFjO1FBQ2QsRUFBRTtRQUNGLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBRXBDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxjQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLGNBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUE7UUFFeEYsZ0ZBQWdGO1FBQ2hGLG9GQUFvRjtRQUNwRix5QkFBeUI7UUFDekIsRUFBRTtRQUNGLHFGQUFxRjtRQUNyRixjQUFj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QUMsYUFBYSxDQUFDLE9BQU87Z0JBQ3hDLGtCQUFrQixFQUFFLEtBQUs7Z0JBQ3pCLGtCQUFrQixFQUFFLEtBQUs7YUFDNUIsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQztTQUMzRTtJQUNMLENBQUM7Q0FDRjtBQTdLRCxrQ0E2S0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKiDCqSAyMDIyIEFtYXpvbiBXZWIgU2VydmljZXMsIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogU2ltcGxlSU9UIHByb2plY3QuXG4gKiBBdXRob3I6IFJhbWluIEZpcm9venllIChmcmFtaW5AYW1hem9uLmNvbSlcbiovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgZWMyID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWVjMicpXG5pbXBvcnQgcmRzID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLXJkcycpXG5pbXBvcnQgaWFtID0gcmVxdWlyZSgnYXdzLWNkay1saWIvYXdzLWlhbScpXG5pbXBvcnQge0lTZWNyZXQsIFNlY3JldH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCB7Q29tbW9ufSBmcm9tIFwiLi9jb21tb25cIlxuaW1wb3J0IHtDREtMYW1iZGFMYXllcn0gZnJvbSBcIi4vY2RrX2xhbWJkYWxheWVyXCI7XG5pbXBvcnQge0NES1N0YXRpY0lPVH0gZnJvbSBcIi4vY2RrX3N0YXRpY2lvdFwiO1xuaW1wb3J0IHtCbG9ja0RldmljZVZvbHVtZSwgUGVlciwgUG9ydH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lYzJcIjtcbmltcG9ydCB7QXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLCBQb3N0Z3Jlc0VuZ2luZVZlcnNpb259IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtcmRzXCI7XG5cblxuaW50ZXJmYWNlIElEYXRhYmFzZVByb3BzIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrUHJvcHMge1xuICAgIHByZWZpeDogc3RyaW5nLFxuICAgIHVzZUF1cm9yYTogYm9vbGVhbixcbiAgICB1dWlkOiBzdHJpbmcsXG4gICAgdnBjOiBlYzIuSVZwYyxcbiAgICBteUlwOiBzdHJpbmcsXG4gICAgcG9zdGdyZXNGdWxsVmVyc2lvbjogc3RyaW5nLFxuICAgIHBvc3RncmVzTWFqb3JWZXJzaW9uOiBzdHJpbmcsXG4gICAgZGJQb3J0OiBzdHJpbmcsXG4gICAgaHR0cHNQb3J0OiBzdHJpbmcsXG4gICAgZGJVc2VybmFtZTogc3RyaW5nLFxuICAgIGRiUGFzc3dvcmRLZXk6IHN0cmluZyxcbiAgICBkYk5hbWU6IHN0cmluZyxcbiAgICBhbGxvY2F0ZWRTdG9yYWdlOiBudW1iZXIsXG4gICAgbWF4QWxsb2NhdGVkU3RvcmFnZTogbnVtYmVyLFxuICAgIGtleXBhaXJOYW1lOiBzdHJpbmcsXG4gICAgbWF4R2VuZXJhdGVkUGFzc3dvcmRMZW5ndGg6IG51bWJlcixcbiAgICB0YWdzOiB7W25hbWU6IHN0cmluZ106IGFueX1cbn07XG5cblxuZXhwb3J0IGNsYXNzIENES0RhdGFiYXNlIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrIHtcbiAgcHVibGljIGJhc3Rpb246IGVjMi5CYXN0aW9uSG9zdExpbnV4O1xuICBwdWJsaWMgZGF0YWJhc2VDbHVzdGVyOiByZHMuRGF0YWJhc2VDbHVzdGVyOyAvLyBGb3IgQXVyb3JhIHVzZVxuICBwdWJsaWMgZGF0YWJhc2VJbnN0YW5jZTogcmRzLkRhdGFiYXNlSW5zdGFuY2U7XG4gIHB1YmxpYyBkYlNlY3VyaXR5R3JvdXAgOiBlYzIuSVNlY3VyaXR5R3JvdXA7XG4gIHB1YmxpYyBkYXRhYmFzZUhvc3RuYW1lIDogc3RyaW5nO1xuICByZWFkb25seSBkYXRhYmFzZVNlY3JldDogcmRzLkRhdGFiYXNlU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJRGF0YWJhc2VQcm9wcykge1xuICAgICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICAgIENvbW1vbi5hZGRUYWdzKHRoaXMsIHByb3BzLnRhZ3MpXG5cbiAgICAgIC8vIGNvbnNvbGUubG9nKFwiRXhlY3V0aW5nOiBEYXRhYmFzZSBzdGFjayB3aXRoIHByZWZpeDogXCIgKyBuYW1lUHJlZml4KVxuXG4gICAgICBsZXQgYmFzdGlvblNlY3VyaXR5R3JvdXBOYW1lID0gcHJvcHMucHJlZml4ICsgXCJfYmFzdGlvbl9zc2hfc2dcIjtcbiAgICAgIGxldCBiYXN0aW9uU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcImJhc3Rpb25fc2VjdXJpdHlfZ3JvdXBcIixcbiAgICAgICAgICB7XG4gICAgICAgICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICAgICAgICBzZWN1cml0eUdyb3VwTmFtZTogYmFzdGlvblNlY3VyaXR5R3JvdXBOYW1lLFxuICAgICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgICAgICAgfSk7XG5cbiAgICAgIC8vIE5PVEU6IHdlIGxpbWl0IGFjY2VzcyB0byBiYXN0aW9uIGhvc3QgdG8gdGhlIGRldmljZSB0aGlzIGlzIHJ1bm5pbmcgb24uXG4gICAgICAvLyBUaGlzIG1lYW5zIGFueSBmdXR1cmUgYWNjZXNzIHRvIHRoZSBiYXN0aW9uIGhvc3Qgd2lsbCByZXF1aXJlIGJlaW5nIGZyb20gdGhlIHNhbWVcbiAgICAgIC8vIElQIGFkZHJlc3MuXG4gICAgICAvL1xuICAgICAgbGV0IGlwV2l0aENJRFIgPSBwcm9wcy5teUlwICsgXCIvMzJcIjtcblxuICAgICAgYmFzdGlvblNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5pcHY0KGlwV2l0aENJRFIpLCBQb3J0LnRjcCgyMiksIFwiSW5jb21pbmcgU1NIXCIpXG5cbiAgICAgIC8vIFdlIGNhbiBoYXZlIGEgY3VzdG9tIHNlY3VyaXR5IGdyb3VwLiBCdXQgdGhlIGFsbG93X2Zyb21fYW55X2lwdjQoKSBjYWxsIGJlbG93XG4gICAgICAvLyBkb2VzIHRoZSBzYW1lIHRoaW5nLiBTbyB0aGVzZSBhcmUgY29tbWVudGVkIGZvciBub3csIGJ1dCBwcm92aWRlZCBpbiBjYXNlIHdlIG5lZWRcbiAgICAgIC8vIHRvIGNyZWF0ZSBhIGN1c3RvbSBTRy5cbiAgICAgIC8vXG4gICAgICAvLyBBbGxvdyBpbmdyZXNzIGZyb20gU1NIIC0gZnJvbSBhbnkgaG9zdC4gV2UgY2FuIHRpZ2h0ZW4gdGhpcyBtb3JlIHRvIHNwZWNpZmljIGhvc3RzXG4gICAgICAvLyBpZiBuZWVkIGJlLlxuICAgICAgLy9cbiAgICAgIC8vIGJhc3Rpb25fc2VjdXJpdHlfZ3JvdXAuYWRkX2luZ3Jlc3NfcnVsZShlYzIuUGVlci5hbnlfaXB2NCgpLCBlYzIuUG9ydC50Y3AoMjIpLCBcIlNTSCBhY2Nlc3NcIilcbiAgICAgIC8vXG4gICAgICAvLyBUaGlzIGlzIGEgYml0IHRvbyBwZXJtaXNzaXZlLiBXZSdyZSBnb2luZyB0byBuZWVkIHRvIGFzc2lnbiBhIGRpZmZlcmVudCBzZWN1cml0eSBncm91cFxuICAgICAgLy8gZm9yIGFsbG93aW5nIHJkcyB0byBjb250YWN0LlxuXG4gICAgICBsZXQgYmFzdGlvbl9pbnN0YW5jZV9uYW1lID0gcHJvcHMucHJlZml4ICsgXCJfZGJfYmFzdGlvbl9ob3N0XCJcbiAgICAgIHRoaXMuYmFzdGlvbiA9IG5ldyBlYzIuQmFzdGlvbkhvc3RMaW51eCh0aGlzLCBcImRiX2Jhc3Rpb25faG9zdFwiLCB7XG4gICAgICAgICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICAgICAgICBibG9ja0RldmljZXM6IFtcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBkZXZpY2VOYW1lOiAnL2Rldi94dmRhJyxcbiAgICAgICAgICAgICAgICAgICAgICBtYXBwaW5nRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICB2b2x1bWU6IGVjMi5CbG9ja0RldmljZVZvbHVtZS5lYnMoMjAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlT25UZXJtaW5hdGlvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdm9sdW1lVHlwZTogZWMyLkVic0RldmljZVZvbHVtZVR5cGUuU1RBTkRBUkQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGVuY3J5cHRlZDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIGluc3RhbmNlTmFtZTogYmFzdGlvbl9pbnN0YW5jZV9uYW1lLFxuICAgICAgICAgICAgICBzZWN1cml0eUdyb3VwOiBiYXN0aW9uU2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgICAgc3VibmV0U2VsZWN0aW9uOiB7c3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDfSxcbiAgICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQyLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKVxuICAgICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIE5PVEU6IHRoZSBuYW1lIG9mIHRoZSBrZXlwYWlyIE1VU1QgYmUgY3JlYXRlZCBtYW51YWxseSB1c2luZyB0aGUgQVdTIENvbnNvbGUgdW5kZXIgRUMyL0tleXBhaXJzLlxuICAgICAgLy8gVGhlIG5hbWUgTVVTVCBtYXRjaCB0aGUgbmFtZSBpbiB0aGUgQkFTVElPTl9TU0hfRUMyX0tFWVBBSVJfTkFNRSB2YXJpYWJsZSAoc2VlIGFib3ZlKS5cbiAgICAgIC8vIFRoZSBTU0ggZmlsZSBpdHNlbGYgc2hvdWxkIGJlIHBsYWNlZCBzb21ld2hlcmUgdGhlIERCIGltcG9ydGVyIGNhbiBmaW5kIGl0IGFuZCB0aGVuIHVzZWQgZm9yXG4gICAgICAvLyBkb2luZyBhIHJlbW90ZSBTU0ggaW50byB0aGUgYmFzdGlvbiBob3N0IHNvIHRoZSBkYXRhYmFzZSBjYW4gYmUgdXBkYXRlZC5cbiAgICAgIC8vIEFMU086IGRvbid0IGZvcmdldCB0byBjaG1vZCAwNDAwIHRoZSBrZXlwYWlyIC5wZW0gZmlsZSBvbmNlIGl0J3MgZG93bmxvYWRlZC5cblxuICAgICAgdGhpcy5iYXN0aW9uLmluc3RhbmNlLmluc3RhbmNlLmFkZFByb3BlcnR5T3ZlcnJpZGUoXCJLZXlOYW1lXCIsIHByb3BzLmtleXBhaXJOYW1lKTtcbiAgICAgIHRoaXMuYmFzdGlvbi5hbGxvd1NzaEFjY2Vzc0Zyb20oKVxuXG4gICAgICAvLyBUaGlzIGFkZHMgc3NoIGFjY2VzcyBmcm9tIGFueSBJUCBhZGRyZXNzLlxuICAgICAgLy8gdGhpcy5iYXN0aW9uLmNvbm5lY3Rpb25zLmFsbG93RnJvbUFueUlwdjQoZWMyLlBvcnQudGNwKDIyKSwgXCJTU0ggQWNjZXNzXCIpXG5cbiAgICAgIGxldCBzZWN1cml0eUdyb3VwTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2RiX3NnXCI7XG4gICAgICB0aGlzLmRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcImRiX3NlY3VyaXR5X2dyb3VwXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICAgICAgc2VjdXJpdHlHcm91cE5hbWU6IHNlY3VyaXR5R3JvdXBOYW1lLFxuICAgICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgKTtcblxuICAgICAgLy8gQWxsb3cgaW5ncmVzcyBmcm9tIERhdGFiYXNlIGFuZCBIVFRQUyBzbyBTU0ggYmFzdGlvbiBhcyB3ZWxsIGFzIGxhbWJkYXMgY2FuIGFjY2VzcyBpdC5cblxuICAgICAgdGhpcy5kYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AocGFyc2VJbnQocHJvcHMuZGJQb3J0KSksIFwiRGF0YWJhc2UgcG9ydFwiKVxuICAgICAgdGhpcy5kYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AocGFyc2VJbnQocHJvcHMuaHR0cHNQb3J0KSksIFwiSFRUUFMgcG9ydFwiKVxuXG4gICAgICAvLyBOT1RFOiBmb3IgcHJvZHVjdGlvbiwgeW91J2xsIHdhbnQgdG8gZnVydGhlciByZXN0cmljdCB0aGUgU2VjdXJpdHkgR3JvdXAgYnkgbGltaXRpbmdcbiAgICAgIC8vIHdoaWNoIElQIGFkZHJlc3NlcyBhcmUgYWxsb3dlZCB0byBjb25uZWN0IHZpYSBTU0guXG5cbiAgICAgIC8vIFRoZSBkYXRhYmFzZSBzZWNyZXQgaXMgZ2VuZXJhdGVkIGhlcmUuIFRvIGltcGxlbWVudCBhdXRvbWF0aWMgc2VjcmV0IHJvdGF0aW9uLCBtb3JlXG4gICAgICAvLyBpbmZvcm1hdGlvbiBjYW4gYmUgZm91bmQgaGVyZTpcbiAgICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL2xhdGVzdC9kb2NzL2F3cy1zZWNyZXRzbWFuYWdlci1yZWFkbWUuaHRtbCNyb3RhdGluZy1kYXRhYmFzZS1jcmVkZW50aWFsc1xuICAgICAgLy9cbiAgICAgIHRoaXMuZGF0YWJhc2VTZWNyZXQgPSBuZXcgcmRzLkRhdGFiYXNlU2VjcmV0KHRoaXMsICdkYl9zZWNyZXQnLCB7XG4gICAgICAgICAgdXNlcm5hbWU6IHByb3BzLmRiVXNlcm5hbWUsXG4gICAgICAgICAgc2VjcmV0TmFtZTogcHJvcHMuZGJQYXNzd29yZEtleVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChwcm9wcy51c2VBdXJvcmEpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcIiAgICAtIFdpdGggQXVyb3JhL1Bvc3RncmVzIHZlcnNpb246IFwiICsgcHJvcHMucG9zdGdyZXNGdWxsVmVyc2lvbilcbiAgICAgICAgICB0aGlzLmRhdGFiYXNlQ2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsIFwiZGJfY2x1c3RlclwiLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0RGF0YWJhc2VOYW1lOiBwcm9wcy5kYk5hbWUsXG4gICAgICAgICAgICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICAgICAgICAgICAgICAgIHZlcnNpb246IEF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5vZihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcHMucG9zdGdyZXNGdWxsVmVyc2lvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcHMucG9zdGdyZXNNYWpvclZlcnNpb25cbiAgICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICBwb3J0OiBwYXJzZUludChwcm9wcy5kYlBvcnQpLFxuICAgICAgICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgICAgICAgIHN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYXRhYmFzZVNlY3JldCksXG4gICAgICAgICAgICAgICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLk1FTU9SWTUsIGVjMi5JbnN0YW5jZVNpemUuTEFSR0UpLFxuICAgICAgICAgICAgICAgICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICAgICAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURVxuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICAgIHRoaXMuZGF0YWJhc2VIb3N0bmFtZSA9IHRoaXMuZGF0YWJhc2VDbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZTtcblxuICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgIC8vIE5PVEU6IHdlIGFyZSB1c2luZyBhbiBSRFMvUG9zdGdyZXMgaW5zdGFuY2UgaW5zdGVhZCBvZiBhbiBBdXJvcmFQb3N0Z3JlcyBpbnN0YW5jZSBzbyB3ZSBjYW4ga2VlcCB1c2FnZSBjb3N0c1xuICAgICAgICAgIC8vIGZvciBkZXZlbG9wbWVudCBpbnNpZGUgdGhlIGZyZWUgdGllciByYW5nZS4gVGhpcywgaG93ZXZlciwgd2lsbCBub3Qgc2NhbGUgd2VsbC5cbiAgICAgICAgICAvLyBGb3IgcHJvZHVjdGlvbiB1c2UsIHdlIHNob3VsZCB1c2UgdGhlIEF1cm9yYSBWZXJzaW9uIHNvIGl0IGNhbiBhdXRvLXNjYWxlLiBCdXQgaXQgd2lsbCBub3QgaGF2ZSBhXG4gICAgICAgICAgLy8gZnJlZSB0aWVyIG9wdGlvbi5cbiAgICAgICAgICAvL1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgIC0gV2l0aCBSRFMvUG9zdGdyZXMgdmVyc2lvbjogXCIgKyBwcm9wcy5wb3N0Z3Jlc0Z1bGxWZXJzaW9uKVxuICAgICAgICAgIGNvbnN0IGVuZ2luZSA9IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgICAgICAgdmVyc2lvbjogUG9zdGdyZXNFbmdpbmVWZXJzaW9uLm9mKFxuICAgICAgICAgICAgICAgICAgcHJvcHMucG9zdGdyZXNGdWxsVmVyc2lvbixcbiAgICAgICAgICAgICAgICAgIHByb3BzLnBvc3RncmVzTWFqb3JWZXJzaW9uKVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgdGhpcy5kYXRhYmFzZUluc3RhbmNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdkYi1pbnN0YW5jZScsIHtcbiAgICAgICAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgICAgICAgIGRhdGFiYXNlTmFtZTogcHJvcHMuZGJOYW1lLFxuICAgICAgICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHBvcnQ6IHBhcnNlSW50KHByb3BzLmRiUG9ydCksXG4gICAgICAgICAgICAgIGVuZ2luZTogZW5naW5lLFxuICAgICAgICAgICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoXG4gICAgICAgICAgICAgICAgICBlYzIuSW5zdGFuY2VDbGFzcy5CVVJTVEFCTEUzLFxuICAgICAgICAgICAgICAgICAgZWMyLkluc3RhbmNlU2l6ZS5NSUNST1xuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYXRhYmFzZVNlY3JldCksXG4gICAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgICBtdWx0aUF6OiBmYWxzZSxcbiAgICAgICAgICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgYWxsb2NhdGVkU3RvcmFnZTogcHJvcHMuYWxsb2NhdGVkU3RvcmFnZSxcbiAgICAgICAgICAgICAgbWF4QWxsb2NhdGVkU3RvcmFnZTogcHJvcHMubWF4QWxsb2NhdGVkU3RvcmFnZSxcbiAgICAgICAgICAgICAgYWxsb3dNYWpvclZlcnNpb25VcGdyYWRlOiB0cnVlLFxuICAgICAgICAgICAgICBhdXRvTWlub3JWZXJzaW9uVXBncmFkZTogdHJ1ZSxcbiAgICAgICAgICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cygwKSxcbiAgICAgICAgICAgICAgZGVsZXRlQXV0b21hdGVkQmFja3VwczogdHJ1ZSxcbiAgICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgICAgICAgcHVibGljbHlBY2Nlc3NpYmxlOiBmYWxzZSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHRoaXMuZGF0YWJhc2VJbnN0YW5jZS5jb25uZWN0aW9ucy5hbGxvd0Zyb20odGhpcy5iYXN0aW9uLCBlYzIuUG9ydC50Y3AocGFyc2VJbnQocHJvcHMuZGJQb3J0KSkpO1xuICAgICAgICAgIHRoaXMuZGF0YWJhc2VIb3N0bmFtZSA9IHRoaXMuZGF0YWJhc2VJbnN0YW5jZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lO1xuICAgICAgfVxuICB9XG59XG4iXX0=