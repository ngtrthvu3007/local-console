import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APIGatewayClient,
  CreateAuthorizerCommand,
  CreateDeploymentCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetResourcesCommand,
  PutIntegrationCommand,
  PutIntegrationResponseCommand,
  PutMethodCommand,
  PutMethodResponseCommand,
  type PutIntegrationCommandInput,
} from "@aws-sdk/client-api-gateway";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateAuthorizerCommand as CreateAuthorizerV2Command,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateRouteResponseCommand,
  CreateStageCommand,
  DeleteApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  DeleteFunctionCommand,
  GetPolicyCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { DeleteQueueCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  ListExecutionsCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { apiGatewaySourcesOf } from "../../core/src/services/apigateway/lambdaPermissions.ts";
import { testInvokeUrl, webSocketUrl } from "../../core/src/services/apigateway/invokeUrl.ts";
import { AWS_PROXY_PATH } from "../../web/src/shared/constants.ts";
import {
  ACCOUNT_ID,
  CONSOLE_URL,
  consoleConfig,
  createTestFunction,
  createTestQueue,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// API Gateway nối sang service khác. Gọi qua proxy /aws của console (đường tab Test dùng) rồi kiểm dữ
// liệu ở service đích. Dạng URI / template theo khảo sát Floci 2.4.0:
// docs/superpowers/researchs/2026-11-19-floci-survey/apigateway.md

const STAGE = "test";
const WS_WAIT_MS = 5000;
const PASSWORD = "Passw0rd!Passw0rd!";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-apigw`;
const EVENT_SOURCE = "lc.it.apigw";

let region: string;
let publicUrl: string;
let v1: APIGatewayClient;
let v2: ApiGatewayV2Client;
let lambda: LambdaClient;
let sqs: SQSClient;

const restIds: string[] = [];
const v2Ids: string[] = [];
const functions: string[] = [];
const queueUrls: string[] = [];
const cleanups: (() => Promise<unknown>)[] = [];

const lambdaUri = (functionArn: string) =>
  `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;
const serviceUri = (service: string, rest: string) =>
  `arn:aws:apigateway:${region}:${service}:${rest}`;

async function createFunction(source: string) {
  const name = uniqueName("apigw-fn");
  functions.push(name);
  return createTestFunction(lambda, { name, source });
}

async function createQueue() {
  const name = uniqueName("apigw-q");
  const queue = await createTestQueue(sqs, name);
  queueUrls.push(queue.url);
  return { ...queue, name };
}

const receiveOne = (queueUrl: string) =>
  waitFor("a message in the queue", async () => {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
    );
    return Messages?.[0]?.Body;
  });

type Integration = Omit<PutIntegrationCommandInput, "restApiId" | "resourceId" | "httpMethod">;

// REST API: POST /<pathPart> với integration cho sẵn, có method / integration response 200 như CDK tạo
async function restApiWith(
  pathPart: string,
  integration: Integration,
  authorizerOf?: AuthorizerOf,
) {
  const restApiId = (await v1.send(new CreateRestApiCommand({ name: uniqueName("apigw-int") })))
    .id!;
  restIds.push(restApiId);
  const root = (await v1.send(new GetResourcesCommand({ restApiId }))).items![0].id!;
  const { id: resourceId } = await v1.send(
    new CreateResourceCommand({ restApiId, parentId: root, pathPart }),
  );
  const method = { restApiId, resourceId, httpMethod: "POST" };
  const authorizerId = authorizerOf ? await authorizerOf(restApiId) : undefined;
  await v1.send(
    new PutMethodCommand({
      ...method,
      authorizationType: authorizerId ? "CUSTOM" : "NONE",
      authorizerId,
    }),
  );
  await v1.send(new PutIntegrationCommand({ ...method, ...integration }));
  await v1.send(new PutMethodResponseCommand({ ...method, statusCode: "200" }));
  await v1.send(
    new PutIntegrationResponseCommand({ ...method, statusCode: "200", selectionPattern: "" }),
  );
  await v1.send(new CreateDeploymentCommand({ restApiId, stageName: STAGE }));
  return restApiId;
}

type AuthorizerOf = (restApiId: string) => Promise<string>;

const call = (apiId: string, path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(`${CONSOLE_URL}${testInvokeUrl(AWS_PROXY_PATH, apiId, STAGE, path, "")}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

beforeAll(async () => {
  ({ region, flociPublicUrl: publicUrl } = await consoleConfig());
  const config = viaConsole(region);
  v1 = new APIGatewayClient(config);
  v2 = new ApiGatewayV2Client(config);
  lambda = new LambdaClient(config);
  sqs = new SQSClient(config);
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  for (const id of restIds)
    await v1.send(new DeleteRestApiCommand({ restApiId: id })).catch(() => {});
  for (const id of v2Ids) await v2.send(new DeleteApiCommand({ ApiId: id })).catch(() => {});
  for (const name of functions)
    await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => {});
  for (const url of queueUrls)
    await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(() => {});
});

describe("REST AWS integrations deliver to the target service", () => {
  it("SQS (path form + form template): the request body becomes a message", async () => {
    const queue = await createQueue();
    const apiId = await restApiWith("orders", {
      type: "AWS",
      integrationHttpMethod: "POST",
      uri: serviceUri("sqs", `path/${ACCOUNT_ID}/${queue.name}`),
      requestParameters: {
        "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'",
      },
      requestTemplates: {
        "application/json": "Action=SendMessage&MessageBody=$util.urlEncode($input.body)",
      },
    });

    const response = await call(apiId, "/orders", '{"order":1}');

    expect(response.status).toBe(200);
    expect(await receiveOne(queue.url)).toBe('{"order":1}');
  });

  it("SNS Publish (JSON template): a subscribed queue gets the message", async () => {
    const sns = new SNSClient(viaConsole(region));
    const { TopicArn } = await sns.send(new CreateTopicCommand({ Name: uniqueName("apigw-t") }));
    cleanups.push(() => sns.send(new DeleteTopicCommand({ TopicArn })));
    const queue = await createQueue();
    await sns.send(
      new SubscribeCommand({
        TopicArn,
        Protocol: "sqs",
        Endpoint: queue.arn,
        Attributes: { RawMessageDelivery: "true" },
      }),
    );
    const apiId = await restApiWith("notify", {
      type: "AWS",
      integrationHttpMethod: "POST",
      uri: serviceUri("sns", "action/Publish"),
      requestTemplates: {
        "application/json": `{"TopicArn":"${TopicArn}","Message":"$util.escapeJavaScript($input.body)"}`,
      },
    });

    const response = await call(apiId, "/notify", '{"alert":"disk"}');

    expect(response.status).toBe(200);
    expect(await receiveOne(queue.url)).toBe('{"alert":"disk"}');
  });

  it("DynamoDB PutItem: the item is written", async () => {
    const ddb = new DynamoDBClient(viaConsole(region));
    const table = uniqueName("apigw-tbl");
    await ddb.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      }),
    );
    cleanups.push(() => ddb.send(new DeleteTableCommand({ TableName: table })));
    const apiId = await restApiWith("items", {
      type: "AWS",
      integrationHttpMethod: "POST",
      uri: serviceUri("dynamodb", "action/PutItem"),
      requestTemplates: {
        "application/json": `{"TableName":"${table}","Item":{"pk":{"S":"$input.path('$.id')"},"note":{"S":"$input.path('$.note')"}}}`,
      },
    });

    const response = await call(apiId, "/items", '{"id":"a1","note":"from api"}');

    expect(response.status).toBe(200);
    const { Item } = await ddb.send(
      new GetItemCommand({ TableName: table, Key: { pk: { S: "a1" } }, ConsistentRead: true }),
    );
    expect(Item).toEqual({ pk: { S: "a1" }, note: { S: "from api" } });
  });

  it("Step Functions StartExecution: an execution starts with the request body as input", async () => {
    const sfn = new SFNClient(viaConsole(region));
    const name = uniqueName("apigw-sm");
    const { stateMachineArn } = await sfn.send(
      new CreateStateMachineCommand({
        name,
        roleArn: ROLE_ARN,
        definition: JSON.stringify({
          StartAt: "Done",
          States: { Done: { Type: "Pass", End: true } },
        }),
      }),
    );
    cleanups.push(() => sfn.send(new DeleteStateMachineCommand({ stateMachineArn })));
    const apiId = await restApiWith("start", {
      type: "AWS",
      integrationHttpMethod: "POST",
      uri: serviceUri("states", "action/StartExecution"),
      requestTemplates: {
        "application/json": `{"stateMachineArn":"${stateMachineArn}","input":"$util.escapeJavaScript($input.body)"}`,
      },
    });

    const response = await call(apiId, "/start", '{"job":7}');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("executionArn");
    const executions = await waitFor("an execution", async () => {
      const { executions: list = [] } = await sfn.send(
        new ListExecutionsCommand({ stateMachineArn }),
      );
      return list.length ? list : undefined;
    });
    expect(executions).toHaveLength(1);
  });

  it("EventBridge PutEvents: a rule on the bus forwards the event to a queue", async () => {
    const events = new EventBridgeClient(viaConsole(region));
    const bus = uniqueName("apigw-bus");
    const rule = uniqueName("apigw-rule");
    const queue = await createQueue();
    await events.send(new CreateEventBusCommand({ Name: bus }));
    await events.send(
      new PutRuleCommand({
        Name: rule,
        EventBusName: bus,
        EventPattern: JSON.stringify({ source: [EVENT_SOURCE] }),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: rule,
        EventBusName: bus,
        Targets: [{ Id: "queue", Arn: queue.arn }],
      }),
    );
    cleanups.push(
      () => events.send(new DeleteEventBusCommand({ Name: bus })),
      () => events.send(new DeleteRuleCommand({ Name: rule, EventBusName: bus })),
      () =>
        events.send(new RemoveTargetsCommand({ Rule: rule, EventBusName: bus, Ids: ["queue"] })),
    );
    const apiId = await restApiWith("events", {
      type: "AWS",
      integrationHttpMethod: "POST",
      uri: serviceUri("events", "action/PutEvents"),
      requestParameters: {
        "integration.request.header.X-Amz-Target": "'AWSEvents.PutEvents'",
        "integration.request.header.Content-Type": "'application/x-amz-json-1.1'",
      },
      requestTemplates: {
        "application/json": `{"Entries":[{"Source":"${EVENT_SOURCE}","DetailType":"order","Detail":"$util.escapeJavaScript($input.body)","EventBusName":"${bus}"}]}`,
      },
    });

    const response = await call(apiId, "/events", '{"order":9}');

    expect(response.status).toBe(200);
    expect(JSON.parse(await receiveOne(queue.url))).toMatchObject({
      source: EVENT_SOURCE,
      "detail-type": "order",
      detail: { order: 9 },
    });
  });

  it("Lambda non-proxy (AWS type): the function gets the body and its return value is the response", async () => {
    const fn = await createFunction("export const handler = async (event) => ({ got: event });");
    const apiId = await restApiWith("plain", {
      type: "AWS",
      integrationHttpMethod: "POST",
      uri: lambdaUri(fn.arn),
    });

    const response = await call(apiId, "/plain", '{"x":1}');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ got: { x: 1 } });
  });

  // Floci 2.4.0 không chạy integration S3 (spec API Gateway 7 #6): đưa request sang bộ xử lý kiểu query
  // nên trả lỗi MissingAction; status theo integration response (mặc định 200 như CDK tạo)
  it("S3 (Floci doesn't run it): nothing is written and Floci's MissingAction error comes back", async () => {
    const s3 = new S3Client({ ...viaConsole(region), forcePathStyle: true });
    const bucket = uniqueName("apigw-b");
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    cleanups.push(() => s3.send(new DeleteBucketCommand({ Bucket: bucket })));
    const apiId = await restApiWith("upload", {
      type: "AWS",
      integrationHttpMethod: "PUT",
      uri: serviceUri("s3", `path/${bucket}/item.json`),
    });

    const response = await call(apiId, "/upload", '{"a":1}');

    expect(await response.text()).toContain("MissingAction");
    const { Contents } = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    expect(Contents ?? []).toHaveLength(0);
  });
});

describe("HTTP API service integrations", () => {
  // Floci 2.4.0 không lưu IntegrationSubtype (spec API Gateway 7 #7): gọi ra 500, queue không có tin
  it("an SQS-SendMessage subtype (Floci doesn't run it) answers 500", async () => {
    const queue = await createQueue();
    const { ApiId } = await v2.send(
      new CreateApiCommand({ Name: uniqueName("apigw-sub"), ProtocolType: "HTTP" }),
    );
    v2Ids.push(ApiId!);
    const { IntegrationId } = await v2.send(
      new CreateIntegrationCommand({
        ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationSubtype: "SQS-SendMessage",
        PayloadFormatVersion: "1.0",
        CredentialsArn: ROLE_ARN,
        RequestParameters: { QueueUrl: queue.url, MessageBody: "$request.body" },
      }),
    );
    await v2.send(
      new CreateRouteCommand({
        ApiId,
        RouteKey: "POST /send",
        Target: `integrations/${IntegrationId}`,
      }),
    );
    await v2.send(new CreateStageCommand({ ApiId, StageName: STAGE, AutoDeploy: true }));

    const response = await call(ApiId!, "/send", '{"via":"subtype"}');

    expect(response.status).toBe(500);
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queue.url, WaitTimeSeconds: 1 }),
    );
    expect(Messages ?? []).toHaveLength(0);
  });
});

describe("authorizers backed by other services", () => {
  it("a Lambda REQUEST authorizer answers 401 without the header, 403 on Deny, 200 on Allow", async () => {
    const authorizer = await createFunction(`export const handler = async (event) => ({
      principalId: "user",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Action: "execute-api:Invoke",
          Effect: event.headers?.["x-token"] === "allow" ? "Allow" : "Deny",
          Resource: event.methodArn,
        }],
      },
    });`);
    const backend = await createFunction(
      'export const handler = async () => ({ statusCode: 200, body: "inside" });',
    );
    const apiId = await restApiWith(
      "guarded",
      { type: "AWS_PROXY", integrationHttpMethod: "POST", uri: lambdaUri(backend.arn) },
      async (restApiId) =>
        (
          await v1.send(
            new CreateAuthorizerCommand({
              restApiId,
              name: "request-auth",
              type: "REQUEST",
              authorizerUri: lambdaUri(authorizer.arn),
              identitySource: "method.request.header.x-token",
            }),
          )
        ).id!,
    );
    const status = async (token?: string) =>
      (await call(apiId, "/guarded", "{}", token ? { "x-token": token } : {})).status;

    expect(await status()).toBe(401);
    expect(await status("deny")).toBe(403);
    expect(await status("allow")).toBe(200);
  });

  // Floci chặn issuer Cognito local với compose hiện tại (spec API Gateway 7 #9, #14): tab Authorizers
  // có popover giải thích; ở đây ghi lại hành vi để biết khi Floci đổi
  it("an HTTP API JWT authorizer with a local Cognito issuer answers 401 even with a valid token", async () => {
    const cognito = new CognitoIdentityProviderClient(viaConsole(region));
    const poolId = (
      await cognito.send(new CreateUserPoolCommand({ PoolName: uniqueName("apigw-pool") }))
    ).UserPool!.Id!;
    cleanups.push(() => cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId })));
    const { UserPoolClient } = await cognito.send(
      new CreateUserPoolClientCommand({
        UserPoolId: poolId,
        ClientName: uniqueName("apigw-client"),
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      }),
    );
    const username = uniqueName("apigw-user");
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: username,
        TemporaryPassword: PASSWORD,
        MessageAction: "SUPPRESS",
      }),
    );
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: poolId,
        Username: username,
        Password: PASSWORD,
        Permanent: true,
      }),
    );
    const { AuthenticationResult } = await cognito.send(
      new InitiateAuthCommand({
        ClientId: UserPoolClient!.ClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: username, PASSWORD },
      }),
    );
    const idToken = AuthenticationResult!.IdToken!;
    const issuer = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()).iss;
    const backend = await createFunction(
      'export const handler = async () => ({ statusCode: 200, body: "inside" });',
    );
    const { ApiId } = await v2.send(
      new CreateApiCommand({ Name: uniqueName("apigw-jwt"), ProtocolType: "HTTP" }),
    );
    v2Ids.push(ApiId!);
    const { AuthorizerId } = await v2.send(
      new CreateAuthorizerV2Command({
        ApiId,
        Name: "jwt-auth",
        AuthorizerType: "JWT",
        IdentitySource: ["$request.header.Authorization"],
        JwtConfiguration: { Issuer: issuer, Audience: [UserPoolClient!.ClientId!] },
      }),
    );
    const { IntegrationId } = await v2.send(
      new CreateIntegrationCommand({
        ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: backend.arn,
        PayloadFormatVersion: "2.0",
      }),
    );
    await v2.send(
      new CreateRouteCommand({
        ApiId,
        RouteKey: "POST /me",
        Target: `integrations/${IntegrationId}`,
        AuthorizationType: "JWT",
        AuthorizerId,
      }),
    );
    await v2.send(new CreateStageCommand({ ApiId, StageName: STAGE, AutoDeploy: true }));

    expect((await call(ApiId!, "/me", "{}")).status).toBe(401);
    expect((await call(ApiId!, "/me", "{}", { Authorization: `Bearer ${idToken}` })).status).toBe(
      401,
    );
  });

  it("a Lambda authorizer permission comes back from GetPolicy as an authorizer source", async () => {
    const fn = await createFunction("export const handler = async () => ({});");
    const apiId = "a1b2c3d4e5";
    const authorizerId = "au7x9";
    await lambda.send(
      new AddPermissionCommand({
        FunctionName: fn.name,
        StatementId: "apigw-authorizer",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: `arn:aws:execute-api:${region}:${ACCOUNT_ID}:${apiId}/authorizers/${authorizerId}`,
      }),
    );

    const { Policy } = await lambda.send(new GetPolicyCommand({ FunctionName: fn.name }));

    expect(apiGatewaySourcesOf(Policy ?? "")).toEqual([
      { apiId, stage: "authorizers", method: authorizerId, path: "" },
    ]);
  });
});

describe("WebSocket API with Lambda and @connections", () => {
  it("a route Lambda gets the connection id and @connections pushes a message to the client", async () => {
    const fn = await createFunction(
      "export const handler = async (event) => ({ statusCode: 200, body: event.requestContext.connectionId });",
    );
    const { ApiId } = await v2.send(
      new CreateApiCommand({
        Name: uniqueName("apigw-ws"),
        ProtocolType: "WEBSOCKET",
        RouteSelectionExpression: "$request.body.action",
      }),
    );
    v2Ids.push(ApiId!);
    const { IntegrationId } = await v2.send(
      new CreateIntegrationCommand({ ApiId, IntegrationType: "AWS_PROXY", IntegrationUri: fn.arn }),
    );
    const { RouteId } = await v2.send(
      new CreateRouteCommand({
        ApiId,
        RouteKey: "$default",
        Target: `integrations/${IntegrationId}`,
        RouteResponseSelectionExpression: "$default",
      }),
    );
    await v2.send(new CreateRouteResponseCommand({ ApiId, RouteId, RouteResponseKey: "$default" }));
    await v2.send(new CreateStageCommand({ ApiId, StageName: STAGE }));
    const socket = new WebSocket(webSocketUrl(publicUrl, region, ApiId!, STAGE));
    const received: string[] = [];
    socket.addEventListener("message", (event) => received.push(String(event.data)));
    const nextMessage = (count: number, what: string) =>
      waitFor(what, async () => (received.length >= count ? received[count - 1] : undefined), {
        timeoutMs: WS_WAIT_MS,
        intervalMs: 100,
      });

    try {
      await waitFor(
        "socket open",
        async () => (socket.readyState === WebSocket.OPEN ? true : undefined),
        {
          timeoutMs: WS_WAIT_MS,
          intervalMs: 100,
        },
      );
      socket.send(JSON.stringify({ action: "whoami" }));
      const connectionId = await nextMessage(1, "the connection id from the Lambda");
      const push = await fetch(
        `${publicUrl}/execute-api/${ApiId}/${STAGE}/@connections/${encodeURIComponent(connectionId)}`,
        { method: "POST", body: "pushed from the server" },
      );

      expect(push.status).toBe(200);
      expect(await nextMessage(2, "the pushed message")).toBe("pushed from the server");
    } finally {
      socket.close();
    }
  });
});
