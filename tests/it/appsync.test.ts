import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AppSyncClient,
  CreateApiKeyCommand,
  CreateDataSourceCommand,
  CreateFunctionCommand as CreateAppSyncFunctionCommand,
  CreateGraphqlApiCommand,
  CreateResolverCommand,
  DeleteDataSourceCommand,
  DeleteGraphqlApiCommand,
  GetIntrospectionSchemaCommand,
  GetSchemaCreationStatusCommand,
  ListResolversByFunctionCommand,
  StartSchemaCreationCommand,
} from "@aws-sdk/client-appsync";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { strToU8, zipSync } from "fflate";
import {
  ACCOUNT_ID,
  AWS_PROXY_URL,
  TEST_CREDENTIALS,
  consoleConfig,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Hành vi AppSync của Floci mà trang AppSync dựa vào (spec AppSync mục 7): schema bất đồng bộ, resolver JS
// trên DynamoDB / Lambda, pipeline, query qua proxy bằng API key, Floci không chặn xóa thứ đang dùng

const HTTP_UNAUTHORIZED = 401;
const SCHEMA = `
type Todo { id: ID! title: String }
type Query { getTodo(id: ID!): Todo echo(text: String): String first(id: ID!): Todo }
type Mutation { addTodo(id: ID!, title: String): Todo }
`;
const JS_RUNTIME = { name: "APPSYNC_JS" as const, runtimeVersion: "1.0.0" };
const RESPONSE = "export function response(ctx) { return ctx.result; }";
const GET_ITEM = `import { util } from "@aws-appsync/utils";
export function request(ctx) { return { operation: "GetItem", key: util.dynamodb.toMapValues({ id: ctx.args.id }) }; }
${RESPONSE}`;
const PUT_ITEM = `import { util } from "@aws-appsync/utils";
export function request(ctx) {
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: ctx.args.id }),
    attributeValues: util.dynamodb.toMapValues({ title: ctx.args.title }),
  };
}
${RESPONSE}`;
const INVOKE = `export function request(ctx) { return { operation: "Invoke", payload: { arguments: ctx.args } }; }
${RESPONSE}`;
const PIPELINE = `export function request(ctx) { return {}; }
export function response(ctx) { return ctx.prev.result; }`;

const table = uniqueName("appsync");
const functionName = uniqueName("appsync");

let appsync: AppSyncClient;
let dynamodb: DynamoDBClient;
let lambda: LambdaClient;
let apiId = "";
let apiKey = "";
let graphqlPath = "";

const schemaStatus = async (id: string) =>
  waitFor("schema to settle", async () => {
    const result = await appsync.send(new GetSchemaCreationStatusCommand({ apiId: id }));
    return result.status === "PROCESSING" ? undefined : result;
  });

const saveSchema = async (id: string, sdl: string) => {
  await appsync.send(new StartSchemaCreationCommand({ apiId: id, definition: strToU8(sdl) }));
  return schemaStatus(id);
};

const query = (body: { query: string; variables?: object }, key = apiKey) =>
  fetch(`${AWS_PROXY_URL}${graphqlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  });

const resolver = (typeName: string, fieldName: string, dataSourceName: string, code: string) =>
  appsync.send(
    new CreateResolverCommand({
      apiId,
      typeName,
      fieldName,
      dataSourceName,
      runtime: JS_RUNTIME,
      code,
    }),
  );

beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  appsync = new AppSyncClient(config);
  dynamodb = new DynamoDBClient(config);
  lambda = new LambdaClient(config);

  await dynamodb.send(
    new CreateTableCommand({
      TableName: table,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-appsync`,
      Code: {
        ZipFile: zipSync({
          "index.mjs": strToU8(
            "export const handler = async (event) => `echo:${event.arguments.text}`;",
          ),
        }),
      },
    }),
  );
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    return Configuration?.State === "Active" ? true : undefined;
  });

  const { graphqlApi } = await appsync.send(
    new CreateGraphqlApiCommand({ name: uniqueName("appsync"), authenticationType: "API_KEY" }),
  );
  apiId = graphqlApi?.apiId ?? "";
  graphqlPath = new URL(graphqlApi?.uris?.GRAPHQL ?? "").pathname;
  apiKey = (await appsync.send(new CreateApiKeyCommand({ apiId }))).apiKey?.id ?? "";
});

afterAll(async () => {
  await appsync.send(new DeleteGraphqlApiCommand({ apiId })).catch(() => undefined);
  await dynamodb.send(new DeleteTableCommand({ TableName: table })).catch(() => undefined);
  await lambda
    .send(new DeleteFunctionCommand({ FunctionName: functionName }))
    .catch(() => undefined);
});

const HELLO = `export function request(ctx) { return { payload: "hi" }; }
${RESPONSE}`;
const PASSWORD = "Passw0rd!x";

// API auth Cognito (mặc định) + IAM (phụ), field hello trả "hi" qua data source NONE
async function cognitoApi(userPoolId: string, region: string) {
  const { graphqlApi } = await appsync.send(
    new CreateGraphqlApiCommand({
      name: uniqueName("appsync"),
      authenticationType: "AMAZON_COGNITO_USER_POOLS",
      userPoolConfig: { userPoolId, awsRegion: region, defaultAction: "ALLOW" },
      additionalAuthenticationProviders: [{ authenticationType: "AWS_IAM" }],
    }),
  );
  const id = graphqlApi?.apiId ?? "";
  await saveSchema(id, "type Query { hello: String }");
  await appsync.send(new CreateDataSourceCommand({ apiId: id, name: "none", type: "NONE" }));
  await appsync.send(
    new CreateResolverCommand({
      apiId: id,
      typeName: "Query",
      fieldName: "hello",
      dataSourceName: "none",
      runtime: JS_RUNTIME,
      code: HELLO,
    }),
  );
  return graphqlApi;
}

describe("appsync", () => {
  it("has no schema until one is saved", async () => {
    await expect(
      appsync.send(new GetIntrospectionSchemaCommand({ apiId, format: "SDL" })),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  });

  it("reports schema errors as a JSON string, keeping the old schema", async () => {
    expect((await saveSchema(apiId, SCHEMA)).status).toBe("SUCCESS");

    const failed = await saveSchema(apiId, "type Query { broken: Nope }");
    expect(failed.status).toBe("FAILED");
    expect(JSON.parse(failed.details ?? "").detail.codeErrors.length).toBeGreaterThan(0);

    const { schema } = await appsync.send(
      new GetIntrospectionSchemaCommand({ apiId, format: "SDL" }),
    );
    // Floci bọc SDL trong JSON {"schema":{"definition"}} (AWS trả SDL trơn): console phải gỡ
    expect(JSON.parse(new TextDecoder().decode(schema)).schema.definition).toContain("addTodo");
  });

  it("writes and reads a real table through JS resolvers on a data source without a role", async () => {
    await appsync.send(
      new CreateDataSourceCommand({
        apiId,
        name: "todos",
        type: "AMAZON_DYNAMODB",
        dynamodbConfig: { tableName: table, awsRegion: (await consoleConfig()).region },
      }),
    );
    await resolver("Mutation", "addTodo", "todos", PUT_ITEM);
    await resolver("Query", "getTodo", "todos", GET_ITEM);

    await query({ query: 'mutation { addTodo(id: "1", title: "xin chào") { id } }' });
    const response = await query({ query: '{ getTodo(id: "1") { title } }' });
    expect(await response.json()).toEqual({ data: { getTodo: { title: "xin chào" } } });
  });

  it("passes arguments to Lambda through an Invoke request", async () => {
    await appsync.send(
      new CreateDataSourceCommand({
        apiId,
        name: "echo",
        type: "AWS_LAMBDA",
        lambdaConfig: {
          lambdaFunctionArn: `arn:aws:lambda:${(await consoleConfig()).region}:${ACCOUNT_ID}:function:${functionName}`,
        },
      }),
    );
    await resolver("Query", "echo", "echo", INVOKE);

    const response = await query({ query: '{ echo(text: "hi") }' });
    expect(await response.json()).toEqual({ data: { echo: "echo:hi" } });
  });

  it("runs a pipeline but doesn't list resolvers by function", async () => {
    const { functionConfiguration } = await appsync.send(
      new CreateAppSyncFunctionCommand({
        apiId,
        name: "getFirst",
        dataSourceName: "todos",
        runtime: JS_RUNTIME,
        code: GET_ITEM,
      }),
    );
    const functionId = functionConfiguration?.functionId ?? "";
    await appsync.send(
      new CreateResolverCommand({
        apiId,
        typeName: "Query",
        fieldName: "first",
        kind: "PIPELINE",
        pipelineConfig: { functions: [functionId] },
        runtime: JS_RUNTIME,
        code: PIPELINE,
      }),
    );

    const response = await query({ query: '{ first(id: "1") { title } }' });
    expect(await response.json()).toEqual({ data: { first: { title: "xin chào" } } });
    const { resolvers } = await appsync.send(
      new ListResolversByFunctionCommand({ apiId, functionId }),
    );
    expect(resolvers).toEqual([]);
  });

  it("rejects a wrong API key with 401", async () => {
    expect((await query({ query: "{ __typename }" }, "da2-wrong")).status).toBe(HTTP_UNAUTHORIZED);
  });

  it("deletes a data source a resolver still uses", async () => {
    await expect(
      appsync.send(new DeleteDataSourceCommand({ apiId, name: "echo" })),
    ).resolves.toBeDefined();
  });

  it("takes a Cognito token only as Bearer, and IAM signed for Floci's host through the proxy", async () => {
    const region = (await consoleConfig()).region;
    const cognito = new CognitoIdentityProviderClient(viaConsole(region));
    const pool =
      (await cognito.send(new CreateUserPoolCommand({ PoolName: uniqueName("appsync") }))).UserPool
        ?.Id ?? "";
    try {
      const { UserPoolClient } = await cognito.send(
        new CreateUserPoolClientCommand({
          UserPoolId: pool,
          ClientName: "web",
          ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
        }),
      );
      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: pool,
          Username: "alice",
          MessageAction: "SUPPRESS",
        }),
      );
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: pool,
          Username: "alice",
          Password: PASSWORD,
          Permanent: true,
        }),
      );
      const { AuthenticationResult } = await cognito.send(
        new InitiateAuthCommand({
          ClientId: UserPoolClient?.ClientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD },
        }),
      );
      const api = await cognitoApi(pool, region);
      const graphqlUri = new URL(api?.uris?.GRAPHQL ?? "");
      const body = JSON.stringify({ query: "{ hello }" });
      const post = (headers: Record<string, string>) =>
        fetch(`${AWS_PROXY_URL}${graphqlUri.pathname}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body,
        });

      const token = AuthenticationResult?.IdToken ?? "";
      expect((await post({ authorization: token })).status).toBe(HTTP_UNAUTHORIZED);
      expect(await (await post({ authorization: `Bearer ${token}` })).json()).toEqual({
        data: { hello: "hi" },
      });

      // Ký theo host / path của uris.GRAPHQL rồi gửi qua proxy: Floci nhận chữ ký
      const signer = new SignatureV4({
        service: "appsync",
        region,
        credentials: TEST_CREDENTIALS,
        sha256: Sha256,
      });
      const signed = await signer.sign({
        method: "POST",
        protocol: graphqlUri.protocol,
        hostname: graphqlUri.hostname,
        port: Number(graphqlUri.port),
        path: graphqlUri.pathname,
        headers: { host: graphqlUri.host, "content-type": "application/json" },
        body,
      });
      const { host: _host, ...headers } = signed.headers;
      const iam = await post(headers);
      expect(iam.status).toBe(200);
      expect(JSON.stringify(await iam.json())).not.toContain("signature");
      await appsync.send(new DeleteGraphqlApiCommand({ apiId: api?.apiId }));
    } finally {
      await cognito.send(new DeleteUserPoolCommand({ UserPoolId: pool }));
    }
  });
});
