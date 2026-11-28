import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { GetFunctionCommand, InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DescribeDBInstancesCommand, RDSClient } from "@aws-sdk/client-rds";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Luồng như app CDK: secret sinh password → DB đọc password qua {{resolve:secretsmanager}} →
// Lambda nhận GetAtt Endpoint rồi gọi vào DB. Kiểm cả log group và xóa stack dọn DB

const stackName = uniqueName("rdsflow");
const databaseId = `${stackName}-db`;
const functionName = `${stackName}-fn`;

// Lambda gửi SSLRequest của Postgres: DB thật trả 1 byte "S" hoặc "N"
const PROBE_SOURCE = `const net = require("net");
exports.handler = async () => new Promise((resolve) => {
  const socket = net.connect(Number(process.env.DB_PORT), process.env.DB_HOST, () =>
    socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47])));
  socket.once("data", (data) => { socket.destroy(); resolve(data.toString()); });
  socket.on("error", (error) => resolve(error.message));
});`;

const resolveSecret = (key: string) => ({
  "Fn::Sub": `{{resolve:secretsmanager:\${Secret}:SecretString:${key}}}`,
});

const TEMPLATE = {
  Resources: {
    Secret: {
      Type: "AWS::SecretsManager::Secret",
      Properties: {
        Name: `${stackName}-secret`,
        GenerateSecretString: {
          SecretStringTemplate: '{"username":"postgres"}',
          GenerateStringKey: "password",
          ExcludeCharacters: "/@\" '",
        },
      },
    },
    Database: {
      Type: "AWS::RDS::DBInstance",
      Properties: {
        DBInstanceIdentifier: databaseId,
        Engine: "postgres",
        DBInstanceClass: "db.t3.micro",
        AllocatedStorage: "20",
        MasterUsername: resolveSecret("username"),
        MasterUserPassword: resolveSecret("password"),
      },
    },
    Function: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Timeout: 15,
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
        Code: { ZipFile: PROBE_SOURCE },
        Environment: {
          Variables: {
            DB_HOST: { "Fn::GetAtt": ["Database", "Endpoint.Address"] },
            DB_PORT: { "Fn::GetAtt": ["Database", "Endpoint.Port"] },
          },
        },
      },
    },
  },
};

let cloudformation: CloudFormationClient;
let rds: RDSClient;
let lambda: LambdaClient;
let logs: CloudWatchLogsClient;

const stackStatus = async () =>
  (await cloudformation.send(new DescribeStacksCommand({}))).Stacks?.find(
    (stack) => stack.StackName === stackName,
  )?.StackStatus;

beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  cloudformation = new CloudFormationClient(config);
  rds = new RDSClient(config);
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);

  await cloudformation.send(
    new CreateStackCommand({ StackName: stackName, TemplateBody: JSON.stringify(TEMPLATE) }),
  );
  const status = await waitFor("stack to finish", async () => {
    const current = await stackStatus();
    return current?.endsWith("IN_PROGRESS") ? undefined : current;
  });
  expect(status).toBe("CREATE_COMPLETE");
});

afterAll(async () => {
  if (await stackStatus()) {
    await cloudformation.send(new DeleteStackCommand({ StackName: stackName }));
  }
});

describe("RDS with CloudFormation, Secrets Manager and Lambda", () => {
  it("uses the DB identifier as physical ID (the stack link of the database page)", async () => {
    const { StackResourceSummaries = [] } = await cloudformation.send(
      new ListStackResourcesCommand({ StackName: stackName }),
    );
    const database = StackResourceSummaries.find(
      (resource) => resource.ResourceType === "AWS::RDS::DBInstance",
    );
    expect(database?.PhysicalResourceId).toBe(databaseId);
  });

  it("lets a Lambda reach the database through the endpoint from GetAtt", async () => {
    await waitFor("function to be Active", async () => {
      const { Configuration } = await lambda.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      );
      return Configuration?.State === "Active" ? true : undefined;
    });

    const { Payload, FunctionError } = await lambda.send(
      new InvokeCommand({ FunctionName: functionName }),
    );
    expect(FunctionError).toBeUndefined();
    expect(JSON.parse(Buffer.from(Payload ?? []).toString())).toMatch(/^[SN]$/);
  });

  it("writes the database output to the log group the Logs tab shows", async () => {
    const { events = [] } = await logs.send(
      new FilterLogEventsCommand({ logGroupName: `/aws/rds/instance/${databaseId}/error` }),
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it("deletes the database with the stack", async () => {
    await cloudformation.send(new DeleteStackCommand({ StackName: stackName }));
    await waitFor("stack to be deleted", async () => {
      const status = await stackStatus();
      return !status || status === "DELETE_COMPLETE" ? true : undefined;
    });

    const { DBInstances = [] } = await rds.send(new DescribeDBInstancesCommand({}));
    expect(DBInstances.map((database) => database.DBInstanceIdentifier)).not.toContain(databaseId);
  });
});
