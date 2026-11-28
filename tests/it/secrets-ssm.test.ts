import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
  RotateSecretCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  DeleteParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import {
  FUNCTION_TIMEOUT_SECONDS,
  ROTATION_LAMBDA_SOURCE,
  consoleConfig,
  createTestFunction,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Đúng các lệnh trang Secrets Manager / Parameter Store dùng, qua proxy /aws của console

const secretName = `${uniqueName("secret")}/db`;
const rotatedName = uniqueName("rotated");
const functionName = uniqueName("rotate");
const parameterRoot = `/${uniqueName("param")}`;

let secrets: SecretsManagerClient;
let ssm: SSMClient;
let lambda: LambdaClient;

beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  secrets = new SecretsManagerClient(config);
  ssm = new SSMClient(config);
  lambda = new LambdaClient(config);
});

afterAll(async () => {
  const ignore = () => undefined;
  for (const name of [secretName, rotatedName]) {
    await secrets
      .send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }))
      .catch(ignore);
  }
  await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(ignore);
});

describe("secrets", () => {
  it("creates, reads by name and by ARN with or without its suffix, and updates", async () => {
    const { ARN = "" } = await secrets.send(
      new CreateSecretCommand({ Name: secretName, SecretString: '{"u":"a"}' }),
    );
    expect(ARN).toMatch(/:secret:.+-[A-Za-z0-9]{6}$/);

    for (const id of [secretName, ARN, ARN.slice(0, -7)]) {
      const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: id }));
      expect(SecretString, id).toBe('{"u":"a"}');
    }

    await secrets.send(new PutSecretValueCommand({ SecretId: secretName, SecretString: "b" }));
    const { SecretString } = await secrets.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    expect(SecretString).toBe("b");
  });

  it("hides a secret scheduled for deletion from the list", async () => {
    await secrets.send(new DeleteSecretCommand({ SecretId: secretName, RecoveryWindowInDays: 7 }));
    const { SecretList = [] } = await secrets.send(
      new ListSecretsCommand({ Filters: [{ Key: "name", Values: [secretName] }] }),
    );
    expect(SecretList.map((secret) => secret.Name)).not.toContain(secretName);
    const { DeletedDate } = await secrets.send(new DescribeSecretCommand({ SecretId: secretName }));
    expect(DeletedDate).toBeDefined();
  });

  it("rotates with a real Lambda through all four steps", async () => {
    const { arn: functionArn } = await createTestFunction(lambda, {
      name: functionName,
      source: ROTATION_LAMBDA_SOURCE,
      timeout: FUNCTION_TIMEOUT_SECONDS,
    });
    await secrets.send(new CreateSecretCommand({ Name: rotatedName, SecretString: "before" }));

    await secrets.send(
      new RotateSecretCommand({
        SecretId: rotatedName,
        RotationLambdaARN: functionArn,
        RotationRules: { ScheduleExpression: "rate(1 days)" },
        RotateImmediately: true,
      }),
    );

    const rotated = await waitFor("the new AWSCURRENT value", async () => {
      const { SecretString } = await secrets.send(
        new GetSecretValueCommand({ SecretId: rotatedName }),
      );
      return SecretString?.startsWith("rotated-") ? SecretString : undefined;
    });
    expect(rotated).toMatch(/^rotated-/);
    const { RotationEnabled, LastRotatedDate } = await secrets.send(
      new DescribeSecretCommand({ SecretId: rotatedName }),
    );
    expect(RotationEnabled).toBe(true);
    expect(LastRotatedDate).toBeDefined();

    // Tab Triggers của Lambda tìm secret theo RotationLambdaARN trong ListSecrets, không DescribeSecret
    const { SecretList = [] } = await secrets.send(new ListSecretsCommand({}));
    const listed = SecretList.find((secret) => secret.Name === rotatedName);
    expect(listed?.RotationLambdaARN).toBe(functionArn);
  }, 180_000);
});

describe("parameters", () => {
  const names = Array.from({ length: 9 }, (_, index) => `${parameterRoot}/p${index}`);

  afterAll(async () => {
    await ssm.send(new DeleteParametersCommand({ Names: names })).catch(() => undefined);
  });

  it("returns a SecureString in plain text even without decryption", async () => {
    const name = names[0];
    await ssm.send(new PutParameterCommand({ Name: name, Value: "s3cret", Type: "SecureString" }));
    const { Parameter } = await ssm.send(new GetParameterCommand({ Name: name }));
    expect(Parameter?.Value).toBe("s3cret");
  });

  it("reports names that don't exist when deleting a batch", async () => {
    for (const name of names.slice(1)) {
      await ssm.send(new PutParameterCommand({ Name: name, Value: "x", Type: "String" }));
    }
    const missing = `${parameterRoot}/missing`;

    const { DeletedParameters = [], InvalidParameters = [] } = await ssm.send(
      new DeleteParametersCommand({ Names: [...names, missing] }),
    );

    expect(DeletedParameters).toHaveLength(names.length);
    expect(InvalidParameters).toEqual([missing]);
  });
});
