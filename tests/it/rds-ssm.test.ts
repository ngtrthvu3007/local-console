import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
  type DBInstance,
} from "@aws-sdk/client-rds";
import {
  DeleteParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Cách app hay nối RDS với Parameter Store: DB đọc cấu hình qua {{resolve:ssm…}}, stack ghi
// endpoint vào parameter, app đọc secret rds!… qua /aws/reference/secretsmanager/

const stackName = uniqueName("rdsssm");
const databaseId = `${stackName}-db`;
const managedId = uniqueName("rdsssm-managed");
const path = `/${stackName}`;
const SECRET_REFERENCE_PREFIX = "/aws/reference/secretsmanager/";

const SEEDED = {
  [`${path}/db-user`]: { Value: "appuser", Type: "String" },
  [`${path}/db-name`]: { Value: "shop", Type: "String" },
  [`${path}/db-password`]: { Value: "lc-it-password", Type: "SecureString" },
} as const;

const TEMPLATE = {
  Resources: {
    Database: {
      Type: "AWS::RDS::DBInstance",
      Properties: {
        DBInstanceIdentifier: databaseId,
        Engine: "postgres",
        DBInstanceClass: "db.t3.micro",
        AllocatedStorage: "20",
        MasterUsername: `{{resolve:ssm:${path}/db-user}}`,
        DBName: `{{resolve:ssm:${path}/db-name}}`,
        MasterUserPassword: `{{resolve:ssm-secure:${path}/db-password}}`,
      },
    },
    HostParameter: {
      Type: "AWS::SSM::Parameter",
      Properties: {
        Name: `${path}/db-host`,
        Type: "String",
        Value: { "Fn::GetAtt": ["Database", "Endpoint.Address"] },
      },
    },
  },
};

let cloudformation: CloudFormationClient;
let rds: RDSClient;
let ssm: SSMClient;

const describeDatabase = async (id: string): Promise<DBInstance | undefined> =>
  (await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }))).DBInstances?.[0];

const parameterValue = async (name: string) =>
  (await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }))).Parameter;

beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  cloudformation = new CloudFormationClient(config);
  rds = new RDSClient(config);
  ssm = new SSMClient(config);

  for (const [name, parameter] of Object.entries(SEEDED)) {
    await ssm.send(new PutParameterCommand({ Name: name, ...parameter }));
  }

  await cloudformation.send(
    new CreateStackCommand({ StackName: stackName, TemplateBody: JSON.stringify(TEMPLATE) }),
  );
  const status = await waitFor("stack to finish", async () => {
    const { Stacks = [] } = await cloudformation.send(
      new DescribeStacksCommand({ StackName: stackName }),
    );
    const current = Stacks[0]?.StackStatus;
    return current?.endsWith("IN_PROGRESS") ? undefined : current;
  });
  expect(status).toBe("CREATE_COMPLETE");
});

afterAll(async () => {
  const ignore = () => undefined;
  await cloudformation.send(new DeleteStackCommand({ StackName: stackName })).catch(ignore);
  await rds
    .send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: managedId, SkipFinalSnapshot: true }))
    .catch(ignore);
  await ssm.send(new DeleteParametersCommand({ Names: Object.keys(SEEDED) })).catch(ignore);
});

describe("RDS with SSM Parameter Store", () => {
  it("creates the database from {{resolve:ssm}} values", async () => {
    const database = await describeDatabase(databaseId);

    expect(database?.MasterUsername).toBe("appuser");
    expect(database?.DBName).toBe("shop");
  });

  it("stores the endpoint from GetAtt in a parameter", async () => {
    const database = await describeDatabase(databaseId);

    expect((await parameterValue(`${path}/db-host`))?.Value).toBe(database?.Endpoint?.Address);
  });

  it("reads the rds! secret through /aws/reference/secretsmanager/", async () => {
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: managedId,
        Engine: "postgres",
        DBInstanceClass: "db.t3.micro",
        AllocatedStorage: 20,
        MasterUsername: "postgres",
        ManageMasterUserPassword: true,
      }),
    );
    const database = await describeDatabase(managedId);
    const secretName = (database?.MasterUserSecret?.SecretArn ?? "").split(":secret:")[1];
    // Bỏ hậu tố "-AbC123" của ARN để ra tên secret
    const parameter = await parameterValue(`${SECRET_REFERENCE_PREFIX}${secretName?.slice(0, -7)}`);
    const value = JSON.parse(parameter?.Value ?? "{}");

    expect(value).toMatchObject({
      username: "postgres",
      host: database?.Endpoint?.Address,
      port: database?.Endpoint?.Port,
    });
    expect(value.password).toBeTruthy();
  });
});
