import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'CartVPC', {
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    });

    const securityGroup = new ec2.SecurityGroup(this, 'CartSecurityGroup', {
      vpc,
      description: 'Allow access to RDS from Lambda',
      allowAllOutbound: true
    });

    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(+process.env.DB_PORT!), 'Allow PostgreSQL access from my IP');

    const dbInstance = new rds.DatabaseInstance(this, 'CartPostgresInstance', {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [securityGroup],
      iamAuthentication: false,
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      deleteAutomatedBackups: true,
      deletionProtection: false,
      databaseName: process.env.DB_NAME,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      credentials: rds.Credentials.fromGeneratedSecret(process.env.DB_USERNAME!),
    });

    const cartLambdaFunction = new lambdaNodejs.NodejsFunction(this, 'CartLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../dist/src/main.js'),
      handler: 'handler',
      vpc,
      securityGroups: [securityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      bundling: {
        externalModules: ['@nestjs/core', '@nestjs/common', '@nestjs/platform-express'],
        nodeModules: ['nestjs'],
      },
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: process.env.DB_PORT!,
        DB_USER: process.env.DB_USER!,
        DB_PASSWORD: process.env.DB_PASSWORD!,
        DB_NAME: process.env.DB_NAME!,
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(cartLambdaFunction);

    const cartApi = new apigateway.RestApi(this, 'CartApi', {
      restApiName: 'Nest Service',
      description: 'This service serves a Nest.js application.',
    });

    cartApi.root.addMethod('ANY', lambdaIntegration);
  }
}
