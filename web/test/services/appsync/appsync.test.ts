import { describe, expect, it } from "vitest";
import type { GraphqlApi } from "@aws-sdk/client-appsync";
import {
  apiKeyExpires,
  authLabel,
  authTypesOf,
  formOfFunction,
  formOfResolver,
  functionInput,
  localEndpoint,
  moveAt,
  operationsOf,
  parseVariables,
  proxyGraphqlUrl,
  queryAlert,
  readSchema,
  resolverInput,
  resolverRows,
  runtimeLabel,
  schemaErrors,
  sdlOfIntrospection,
  tokenExpired,
  usageOf,
  withAuthorization,
} from "../../../src/services/appsync/apis.ts";
import { graphqlRequest } from "../../../src/services/appsync/graphqlRequest.ts";
import { isUntouched, templateFor } from "../../../src/services/appsync/resolverTemplates.ts";
import { isDataSourceKind } from "../../../src/services/appsync/constants.ts";
import { API_TABS, appsyncRoutes } from "../../../src/services/appsync/routes.ts";
import {
  apiKeySchema,
  createApiSchema,
  dataSourceSchema,
} from "../../../src/services/appsync/schemas.ts";

const REGION = "ap-southeast-1";
const GRAPHQL_URI = "http://localhost.floci.io:4566/v1/apis/a1/graphql";

describe("appsync", () => {
  it("reads types and fields from AppSync SDL", () => {
    const sdl = [
      '"""A todo"""',
      'type Todo @aws_cognito_user_pools(cognito_groups: ["admins"]) { id: ID! at: AWSDateTime }',
      "# comment",
      "input TodoInput { title: String }",
      "enum Status { OPEN }",
      "type Query { getTodo(id: ID!): Todo @aws_api_key @aws_iam }",
      "type Mutation { addTodo(input: TodoInput): Todo }",
    ].join("\n");
    expect(readSchema(sdl)?.map((type) => type.name)).toEqual(["Query", "Mutation", "Todo"]);
    expect(readSchema(sdl)?.[0].fields).toEqual(["getTodo"]);
    expect(readSchema("type {")).toBeNull();
  });

  it("keeps auth providers the console doesn't edit", () => {
    const api: GraphqlApi = {
      apiId: "a",
      name: "shop",
      authenticationType: "API_KEY",
      additionalAuthenticationProviders: [
        { authenticationType: "OPENID_CONNECT", openIDConnectConfig: { issuer: "https://id" } },
        {
          authenticationType: "AMAZON_COGNITO_USER_POOLS",
          userPoolConfig: { userPoolId: "p1", awsRegion: REGION },
        },
        {
          authenticationType: "AMAZON_COGNITO_USER_POOLS",
          userPoolConfig: { userPoolId: "p2", awsRegion: REGION },
        },
      ],
    };
    const update = withAuthorization(api, {
      defaultType: "API_KEY",
      additional: ["AWS_IAM"],
      region: REGION,
    });
    expect(update).toMatchObject({ apiId: "a", name: "shop", authenticationType: "API_KEY" });
    expect(update.additionalAuthenticationProviders?.map((p) => p.authenticationType)).toEqual([
      "AWS_IAM",
      "OPENID_CONNECT",
      "AMAZON_COGNITO_USER_POOLS",
    ]);
    expect(update.additionalAuthenticationProviders?.[2].userPoolConfig?.userPoolId).toBe("p2");
  });

  it("sets a Cognito default with its user pool", () => {
    const update = withAuthorization(
      { apiId: "a", name: "shop", authenticationType: "API_KEY" },
      {
        defaultType: "AMAZON_COGNITO_USER_POOLS",
        additional: ["API_KEY"],
        userPoolId: "p1",
        region: REGION,
      },
    );
    expect(update.userPoolConfig).toEqual({
      userPoolId: "p1",
      awsRegion: REGION,
      defaultAction: "ALLOW",
    });
    expect(update.additionalAuthenticationProviders).toEqual([{ authenticationType: "API_KEY" }]);
  });

  it("lists the auth types the console can call, default first", () => {
    const api: GraphqlApi = {
      authenticationType: "AMAZON_COGNITO_USER_POOLS",
      additionalAuthenticationProviders: [
        { authenticationType: "OPENID_CONNECT" },
        { authenticationType: "API_KEY" },
        { authenticationType: "AMAZON_COGNITO_USER_POOLS" },
      ],
    };
    expect(authTypesOf(api)).toEqual(["AMAZON_COGNITO_USER_POOLS", "API_KEY"]);
    expect(authTypesOf({ authenticationType: "AWS_LAMBDA" })).toEqual([]);
  });

  it("lists a row per root field and per resolver, flagging fields gone from the schema", () => {
    const types = [
      { name: "Query", fields: ["getTodo", "listTodos"] },
      { name: "Mutation", fields: ["addTodo"] },
      { name: "Todo", fields: ["id", "owner"] },
      { name: "Comment", fields: ["id"] },
    ];
    const rows = resolverRows(types, [
      { typeName: "Query", fieldName: "getTodo", dataSourceName: "todos" },
      { typeName: "Todo", fieldName: "owner", dataSourceName: "users" },
      { typeName: "Query", fieldName: "gone", dataSourceName: "todos" },
    ]);
    expect(rows.map((row) => `${row.typeName}.${row.fieldName}`)).toEqual([
      "Query.getTodo",
      "Query.listTodos",
      "Query.gone",
      "Mutation.addTodo",
      "Todo.owner",
    ]);
    expect(rows[1].resolver).toBeUndefined();
    expect(rows[2].notInSchema).toBe(true);
    expect(rows[0].notInSchema).toBe(false);
  });

  it("turns the resolver form into a CreateResolver request and back", () => {
    const base = {
      dataSourceName: "todos",
      functionIds: [],
      code: "js code",
      request: "req",
      response: "res",
    };
    const js = resolverInput({ ...base, kind: "UNIT", runtime: "js" }, "Query", "getTodo");
    expect(js).toEqual({
      typeName: "Query",
      fieldName: "getTodo",
      kind: "UNIT",
      dataSourceName: "todos",
      runtime: { name: "APPSYNC_JS", runtimeVersion: "1.0.0" },
      code: "js code",
    });
    const vtl = resolverInput({ ...base, kind: "UNIT", runtime: "vtl" }, "Query", "getTodo");
    expect(vtl).toMatchObject({ requestMappingTemplate: "req", responseMappingTemplate: "res" });
    expect(vtl.runtime).toBeUndefined();
    const pipeline = resolverInput(
      { ...base, kind: "PIPELINE", runtime: "js", functionIds: ["f2", "", "f1"] },
      "Mutation",
      "addTodo",
    );
    expect(pipeline).toMatchObject({
      kind: "PIPELINE",
      pipelineConfig: { functions: ["f2", "f1"] },
    });
    expect(pipeline.dataSourceName).toBeUndefined();

    expect(formOfResolver({ ...js, kind: "UNIT" })).toMatchObject({
      runtime: "js",
      code: "js code",
    });
    expect(formOfResolver(vtl)).toMatchObject({ runtime: "vtl", request: "req", response: "res" });
    expect(formOfResolver(pipeline).functionIds).toEqual(["f2", "f1"]);

    const fn = functionInput({
      name: " save ",
      dataSourceName: "todos",
      runtime: "vtl",
      code: "",
      request: "req",
      response: "res",
    });
    expect(fn).toMatchObject({
      name: "save",
      functionVersion: "2018-05-29",
      requestMappingTemplate: "req",
    });
    expect(formOfFunction({ ...fn, functionId: "f1" })).toMatchObject({
      name: "save",
      runtime: "vtl",
      request: "req",
    });
  });

  it("keeps the Cognito default config CDK set when only the extra auth changes", () => {
    const update = withAuthorization(
      {
        apiId: "a",
        name: "shop",
        authenticationType: "AMAZON_COGNITO_USER_POOLS",
        userPoolConfig: {
          userPoolId: "p1",
          awsRegion: REGION,
          defaultAction: "DENY",
          appIdClientRegex: "web.*",
        },
      },
      {
        defaultType: "AMAZON_COGNITO_USER_POOLS",
        additional: ["AWS_IAM"],
        userPoolId: "p1",
        region: REGION,
      },
    );
    expect(update.userPoolConfig).toEqual({
      userPoolId: "p1",
      awsRegion: REGION,
      defaultAction: "DENY",
      appIdClientRegex: "web.*",
    });
  });

  it("edits only the data source types the form knows", () => {
    expect(isDataSourceKind("AMAZON_DYNAMODB")).toBe(true);
    expect(isDataSourceKind("HTTP")).toBe(false);
    expect(isDataSourceKind(undefined)).toBe(false);
  });

  it("lists operations and parses variables", () => {
    expect(operationsOf("query A { a } mutation B { b }").map((o) => o.name)).toEqual(["A", "B"]);
    expect(operationsOf("subscription { onAdd { id } }")[0].kind).toBe("subscription");
    expect(operationsOf("query {")).toEqual([]);
    expect(parseVariables("")).toEqual({ value: {} });
    expect(parseVariables(' { "id": "1" } ')).toEqual({ value: { id: "1" } });
    expect(parseVariables("[1]").error).toBeDefined();
    expect(parseVariables("{").error).toBeDefined();
  });

  it("reads the SDL whether Floci wraps it in JSON or AWS sends it bare", () => {
    const sdl = "type Query { a: String }";
    expect(sdlOfIntrospection(JSON.stringify({ schema: { definition: sdl } }))).toBe(sdl);
    expect(sdlOfIntrospection(sdl)).toBe(sdl);
    expect(sdlOfIntrospection('{"other":1}')).toBe('{"other":1}');
  });

  it("drops Floci's shifted line numbers from schema errors", () => {
    const details = JSON.stringify({
      reason: "CODE_ERROR",
      detail: {
        codeErrors: [
          {
            errorType: "VALIDATION_ERROR",
            value: "Unknown type Foo [@28:1]",
            location: { line: 28 },
          },
        ],
      },
    });
    expect(schemaErrors(details)).toEqual(["Unknown type Foo"]);
    expect(schemaErrors("boom")).toEqual(["boom"]);
    expect(schemaErrors(undefined)).toEqual([]);
  });

  it("finds who uses a data source or function", () => {
    const usage = usageOf(
      [
        { typeName: "Query", fieldName: "getTodo", dataSourceName: "todos" },
        {
          typeName: "Mutation",
          fieldName: "addTodo",
          kind: "PIPELINE",
          pipelineConfig: { functions: ["f1"] },
        },
      ],
      [{ functionId: "f1", name: "saveTodo", dataSourceName: "todos" }],
    );
    expect(usage.dataSources.get("todos")).toEqual(["Query.getTodo", "function saveTodo"]);
    expect(usage.functions.get("f1")).toEqual(["Mutation.addTodo"]);
  });

  it("shows the endpoint on the Floci port and sends queries through the proxy", () => {
    expect(localEndpoint("http://localhost:4566", GRAPHQL_URI)).toBe(
      "http://localhost:4566/v1/apis/a1/graphql",
    );
    expect(proxyGraphqlUrl("http://localhost:3701/aws", GRAPHQL_URI)).toBe(
      "http://localhost:3701/aws/v1/apis/a1/graphql",
    );
  });

  it("sets an API key's expiry in whole days, in epoch seconds", () => {
    expect(apiKeyExpires(7, Date.UTC(2026, 10, 25, 10, 30))).toBe(
      Date.UTC(2026, 11, 2, 10, 30) / 1000,
    );
  });

  it("validates forms", () => {
    expect(apiKeySchema.safeParse({ description: "", days: "0" }).success).toBe(false);
    expect(apiKeySchema.safeParse({ description: "", days: "366" }).success).toBe(false);
    expect(apiKeySchema.parse({ description: "", days: "7" }).days).toBe(7);

    const dataSource = { type: "NONE", tableName: "", functionArn: "", description: "" };
    expect(dataSourceSchema(["todos"]).safeParse({ ...dataSource, name: "todos" }).success).toBe(
      false,
    );
    expect(dataSourceSchema([]).safeParse({ ...dataSource, name: "my-ds" }).success).toBe(false);
    expect(
      dataSourceSchema([]).safeParse({ ...dataSource, name: "t", type: "AMAZON_DYNAMODB" }).success,
    ).toBe(false);

    const api = { authType: "API_KEY", userPoolId: "" };
    expect(createApiSchema.safeParse({ ...api, name: "a".repeat(66) }).success).toBe(false);
    expect(createApiSchema.safeParse({ ...api, name: "todo api_1" }).success).toBe(true);
    expect(
      createApiSchema.safeParse({
        name: "a",
        authType: "AMAZON_COGNITO_USER_POOLS",
        userPoolId: "",
      }).success,
    ).toBe(false);
  });

  it("starts Lambda resolvers with an Invoke request", () => {
    expect(templateFor("AWS_LAMBDA", "js").code).toContain('operation: "Invoke"');
    expect(templateFor("AWS_LAMBDA", "vtl").request).toContain('"operation": "Invoke"');
    expect(templateFor("AMAZON_DYNAMODB", "js").code).toContain('operation: "GetItem"');
    expect(templateFor("NONE", "vtl").response).toBeDefined();
  });

  it("replaces the code only while it is still a template or empty", () => {
    const js = templateFor("NONE", "js");
    expect(isUntouched({ code: js.code, request: "", response: "" }, js)).toBe(true);
    expect(isUntouched({ code: "", request: "", response: "" }, js)).toBe(true);
    expect(isUntouched({ code: "my code", request: "", response: "" }, js)).toBe(false);
  });

  it("sends each auth type the way Floci accepts it", async () => {
    const input = { graphqlUri: GRAPHQL_URI, proxyBase: "http://localhost:3701/aws", body: "{}" };
    const key = await graphqlRequest({ ...input, auth: { type: "API_KEY", key: "da2-x" } });
    expect(key.url).toBe("http://localhost:3701/aws/v1/apis/a1/graphql");
    expect(key.headers["x-api-key"]).toBe("da2-x");

    const cognito = await graphqlRequest({
      ...input,
      auth: { type: "AMAZON_COGNITO_USER_POOLS", token: "t" },
    });
    expect(cognito.headers.authorization).toBe("Bearer t");

    // Ký theo host / path của endpoint Floci (spec 7 #16); trình duyệt không gửi được header host
    const iam = await graphqlRequest({ ...input, auth: { type: "AWS_IAM", region: REGION } });
    expect(iam.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(iam.headers.authorization).toContain(`/${REGION}/appsync/aws4_request`);
    expect(iam.headers.host).toBeUndefined();
    expect(iam.headers["x-amz-date"]).toBeDefined();
  });

  it("explains 401 and the no-schema 502, other errors stay in the response", () => {
    expect(queryAlert(401, "")).toBe("Not authorized: check the key or sign in again.");
    expect(
      queryAlert(
        502,
        '{"errors":[{"errorType":"GraphQLSchemaException","message":"No schema definition exists."}]}',
      ),
    ).toBe("Save a schema first.");
    expect(queryAlert(502, "Bad gateway")).toBeUndefined();
    expect(queryAlert(200, "{}")).toBeUndefined();
  });

  it("labels auth types and runtimes the same way everywhere", () => {
    expect(authLabel("API_KEY")).toBe("API key");
    expect(authLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(authLabel(undefined)).toBe("—");
    expect(runtimeLabel({ runtime: { name: "APPSYNC_JS", runtimeVersion: "1.0.0" } })).toBe("JS");
    expect(runtimeLabel({})).toBe("VTL");
    expect(runtimeLabel(undefined)).toBe("—");
  });

  it("moves a pipeline function up or down, staying inside the list", () => {
    expect(moveAt(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveAt(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveAt(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveAt(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("knows when a signed-in user's token has expired", () => {
    const token = (exp: number) => `${btoa("{}")}.${btoa(JSON.stringify({ exp }))}.s`;
    const now = Date.UTC(2026, 10, 25, 12);
    expect(tokenExpired(token(now / 1000 + 60), now)).toBe(false);
    expect(tokenExpired(token(now / 1000 - 1), now)).toBe(true);
    expect(tokenExpired("garbage", now)).toBe(true);
  });

  it("builds routes", () => {
    expect(appsyncRoutes.api("a1", API_TABS.schema)).toBe("/appsync/apis/a1");
    expect(appsyncRoutes.api("a1", API_TABS.dataSources)).toBe("/appsync/apis/a1?tab=data-sources");
    expect(appsyncRoutes.resolver("a1", "Query", "getTodo")).toBe(
      "/appsync/apis/a1/resolvers/Query/getTodo",
    );
    expect(appsyncRoutes.function("a1", "f1")).toBe("/appsync/apis/a1/functions/f1");
  });
});
