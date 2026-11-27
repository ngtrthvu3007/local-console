import { describe, expect, it } from "vitest";
import { API_TYPES, type AuthorizerRow } from "#services/apigateway/apis.ts";
import {
  authorizationOf,
  cognitoPoolArn,
  identityNamesOf,
  identitySources,
} from "#services/apigateway/authorizers.ts";
import {
  functionArnOfUri,
  integrationFormOf,
  lambdaInvocationUri,
} from "#services/apigateway/integration.ts";
import {
  apiGatewaySourcesOf,
  executeApiSourceArn,
  permissionStatementId,
} from "#services/apigateway/lambdaPermissions.ts";

const REGION = "ap-southeast-1";
const executeApiArn = (rest: string) => `arn:aws:execute-api:${REGION}:000000000000:${rest}`;
const policyWith = (sourceArn: string) =>
  JSON.stringify({
    Statement: [
      {
        Principal: { Service: "apigateway.amazonaws.com" },
        Condition: { ArnLike: { "AWS:SourceArn": sourceArn } },
      },
    ],
  });

describe("executeApiSourceArn", () => {
  it("builds SourceArns for methods, routes and authorizers", () => {
    expect(
      executeApiSourceArn(REGION, "a1", { kind: "method", method: "ANY", path: "/items/{id}" }),
    ).toBe(executeApiArn("a1/*/*/items/{id}"));
    expect(executeApiSourceArn(REGION, "a1", { kind: "method", method: "GET", path: "/" })).toBe(
      executeApiArn("a1/*/GET/"),
    );
    expect(executeApiSourceArn(REGION, "a1", { kind: "route", routeKey: "GET /items" })).toBe(
      executeApiArn("a1/*/GET/items"),
    );
    expect(executeApiSourceArn(REGION, "a1", { kind: "route", routeKey: "ANY /{proxy+}" })).toBe(
      executeApiArn("a1/*/*/{proxy+}"),
    );
    expect(executeApiSourceArn(REGION, "a1", { kind: "route", routeKey: "$default" })).toBe(
      executeApiArn("a1/*/$default"),
    );
    expect(executeApiSourceArn(REGION, "a1", { kind: "authorizer", authorizerId: "z9" })).toBe(
      executeApiArn("a1/authorizers/z9"),
    );
  });

  it("gives SourceArns that Lambda › Triggers reads back", () => {
    const arn = executeApiSourceArn(REGION, "a1", {
      kind: "method",
      method: "GET",
      path: "/items/{id}",
    });
    expect(apiGatewaySourcesOf(policyWith(arn))).toEqual([
      { apiId: "a1", stage: "*", method: "GET", path: "/items/{id}" },
    ]);
  });
});

describe("permissionStatementId", () => {
  const id = (path: string) => permissionStatementId("a1", { kind: "method", method: "GET", path });

  it("makes valid, distinct statement ids", () => {
    expect(id("/items/{id}")).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
    expect(id("/items/{id}")).not.toBe(id("/items"));
    expect(id(`/${"x".repeat(200)}`)).toHaveLength(100);
    expect(permissionStatementId("a1", { kind: "route", routeKey: "$default" })).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it("keeps ids apart when only replaced characters or a cut-off tail differ", () => {
    expect(id("/a.b")).not.toBe(id("/a_b"));
    const shared = `/${"x".repeat(120)}`;
    expect(id(`${shared}/one`)).not.toBe(id(`${shared}/two`));
    expect(id(`${shared}/one`)).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
  });
});

describe("identity sources", () => {
  it("maps names to each API type's identity sources", () => {
    expect(identitySources(API_TYPES.rest, "header", ["Authorization"])).toEqual([
      "method.request.header.Authorization",
    ]);
    expect(identitySources(API_TYPES.http, "header", ["a", "b"])).toEqual([
      "$request.header.a",
      "$request.header.b",
    ]);
    expect(identitySources(API_TYPES.websocket, "querystring", ["token"])).toEqual([
      "route.request.querystring.token",
    ]);
  });

  it("reads names back from an identity source", () => {
    expect(identityNamesOf("method.request.header.A, method.request.header.B")).toEqual({
      kind: "header",
      names: ["A", "B"],
    });
    expect(identityNamesOf("method.request.header.A,method.request.header.B")).toEqual({
      kind: "header",
      names: ["A", "B"],
    });
    expect(identityNamesOf("route.request.querystring.token")).toEqual({
      kind: "querystring",
      names: ["token"],
    });
  });
});

describe("Lambda URIs", () => {
  const fn = `arn:aws:lambda:${REGION}:000000000000:function:f`;

  it("reads the function back from either Lambda URI form", () => {
    expect(lambdaInvocationUri(REGION, fn)).toBe(
      `arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${fn}/invocations`,
    );
    expect(functionArnOfUri(lambdaInvocationUri(REGION, fn))).toBe(fn);
    expect(functionArnOfUri(fn)).toBe(fn);
    expect(
      functionArnOfUri(`arn:aws:apigateway:${REGION}:sqs:path/000000000000/q`),
    ).toBeUndefined();
    expect(functionArnOfUri(undefined)).toBeUndefined();
  });
});

describe("integrationFormOf", () => {
  const fn = `arn:aws:lambda:${REGION}:000000000000:function:f`;
  const httpUrl = "https://example.com/{proxy}";

  it("starts an empty Lambda form when there is no integration yet", () => {
    expect(integrationFormOf(undefined, undefined, true)).toEqual({
      integration: "lambda",
      functionArn: "",
      url: "",
    });
  });

  it("reads Lambda proxy from either URI form", () => {
    for (const uri of [fn, lambdaInvocationUri(REGION, fn)]) {
      expect(integrationFormOf("AWS_PROXY", uri, true)).toEqual({
        integration: "lambda",
        functionArn: fn,
        url: "",
      });
    }
  });

  it("reads HTTP proxy only where the form offers it", () => {
    expect(integrationFormOf("HTTP_PROXY", httpUrl, true)).toEqual({
      integration: "http",
      functionArn: "",
      url: httpUrl,
    });
    expect(integrationFormOf("HTTP_PROXY", httpUrl, false).integration).toBe("other");
  });

  it("locks integrations the console doesn't edit", () => {
    expect(
      integrationFormOf("AWS", `arn:aws:apigateway:${REGION}:sqs:path/0/q`, true).integration,
    ).toBe("other");
    expect(integrationFormOf("MOCK", undefined, true).integration).toBe("other");
    expect(integrationFormOf("AWS_PROXY", undefined, true).integration).toBe("other");
  });
});

describe("cognitoPoolArn", () => {
  it("builds the user pool ARN", () => {
    expect(cognitoPoolArn(REGION, `${REGION}_abc`)).toBe(
      `arn:aws:cognito-idp:${REGION}:000000000000:userpool/${REGION}_abc`,
    );
  });
});

describe("authorizationOf", () => {
  const authorizer = (id: string, type: string): AuthorizerRow => ({
    id,
    type,
    name: id,
    identitySource: "",
  });
  const authorizers = [
    authorizer("t", "TOKEN"),
    authorizer("r", "REQUEST"),
    authorizer("c", "COGNITO_USER_POOLS"),
    authorizer("j", "JWT"),
  ];

  it("turns the authorization choice into API fields", () => {
    expect(authorizationOf("NONE", authorizers)).toEqual({ authorizationType: "NONE" });
    expect(authorizationOf("AWS_IAM", authorizers)).toEqual({ authorizationType: "AWS_IAM" });
    expect(authorizationOf("t", authorizers)).toEqual({
      authorizationType: "CUSTOM",
      authorizerId: "t",
    });
    expect(authorizationOf("r", authorizers)).toEqual({
      authorizationType: "CUSTOM",
      authorizerId: "r",
    });
    expect(authorizationOf("c", authorizers)).toEqual({
      authorizationType: "COGNITO_USER_POOLS",
      authorizerId: "c",
    });
    expect(authorizationOf("j", authorizers)).toEqual({
      authorizationType: "JWT",
      authorizerId: "j",
    });
  });

  // Authorizer đã bị xóa (hoặc danh sách chưa tải): không gửi ID làm authorizationType
  it("returns nothing for an authorizer that isn't there", () => {
    expect(authorizationOf("gone", authorizers)).toBeUndefined();
  });
});
