import { describe, expect, it } from "vitest";
import { cognitoPoolIdOfProviderArn, isLocalIssuer } from "#services/apigateway/authorizers.ts";
import { describeIntegration, integrationLabel } from "#services/apigateway/integration.ts";
import {
  buildTestPath,
  connectionsUrl,
  parseHeaderLines,
  pathParamsOf,
  restInvokeUrl,
  testInvokeUrl,
  webSocketUrl,
} from "#services/apigateway/invokeUrl.ts";
import { apiGatewaySourcesOf } from "#services/apigateway/lambdaPermissions.ts";
import { readTestResponse, sendsBody } from "#services/apigateway/methodTest.ts";
import { resourceTree } from "#services/apigateway/resources.ts";
import { apigatewayRoutes, isApiVersion } from "#services/apigateway/paths.ts";

describe("apigateway helpers", () => {
  it("builds routes with the version in the path", () => {
    expect(apigatewayRoutes.api("v1", "a1b2c3d4e5")).toBe("/apigateway/v1/a1b2c3d4e5");
    expect(apigatewayRoutes.api("v2", "k9", "stages")).toBe("/apigateway/v2/k9?tab=stages");
    expect(isApiVersion("v3")).toBe(false);
  });
  it("reads Lambda integrations", () => {
    const fn = "arn:aws:lambda:ap-southeast-1:000000000000:function:get-item";
    const v1 = `arn:aws:apigateway:ap-southeast-1:lambda:path/2015-03-31/functions/${fn}/invocations`;
    expect(describeIntegration("AWS_PROXY", v1)).toEqual({
      kind: "lambda",
      proxy: true,
      functionName: "get-item",
    });
    expect(describeIntegration("AWS", v1)).toEqual({
      kind: "lambda",
      proxy: false,
      functionName: "get-item",
    });
    expect(describeIntegration("AWS_PROXY", fn)).toMatchObject({ functionName: "get-item" }); // v2: ARN thẳng
    expect(describeIntegration("AWS_PROXY", `${fn}:prod`)).toMatchObject({
      functionName: "get-item",
    });
    expect(
      describeIntegration("AWS_PROXY", v1.replace("get-item", "${stageVariables.fn}")),
    ).toEqual({ kind: "lambda", proxy: true, functionName: undefined });
  });
  it("labels other integrations", () => {
    expect(
      integrationLabel(
        describeIntegration("HTTP_PROXY", "https://example.com"),
        "https://example.com",
      ),
    ).toBe("HTTP proxy → https://example.com");
    expect(integrationLabel(describeIntegration("MOCK", undefined))).toBe("Mock");
    expect(
      describeIntegration("AWS", "arn:aws:apigateway:ap-southeast-1:sqs:path/000000000000/q"),
    ).toEqual({ kind: "aws", service: "sqs" });
  });
  it("builds invoke URLs", () => {
    expect(restInvokeUrl("http://localhost:4566", "a1", "dev")).toBe(
      "http://localhost:4566/restapis/a1/dev/_user_request_/",
    );
    expect(restInvokeUrl("http://localhost.floci.io:4566", "a1", "$default")).toBe(
      "http://localhost.floci.io:4566/restapis/a1/$default/_user_request_/",
    );
    expect(webSocketUrl("http://localhost:4566", "ap-southeast-1", "w1", "prod")).toBe(
      "ws://w1.execute-api.ap-southeast-1.localhost.floci.io:4566/prod",
    );
    expect(connectionsUrl("http://localhost:4566", "w1", "prod")).toBe(
      "http://localhost:4566/execute-api/w1/prod/@connections",
    );
  });
  it("fills path params", () => {
    expect(pathParamsOf("/items/{id}/{proxy+}")).toEqual([
      { name: "id", greedy: false },
      { name: "proxy", greedy: true },
    ]);
    expect(buildTestPath("/items/{id}", { id: "x/y z" })).toBe("/items/x%2Fy%20z");
    expect(buildTestPath("/files/{proxy+}", { proxy: "a/b c/d" })).toBe("/files/a/b%20c/d");
    expect(testInvokeUrl("/aws", "a1", "dev", "/items/42", "q=abc")).toBe(
      "/aws/restapis/a1/dev/_user_request_/items/42?q=abc",
    );
    expect(testInvokeUrl("/aws", "a1", "dev", "/", "")).toBe(
      "/aws/restapis/a1/dev/_user_request_/",
    );
  });
  it("parses header lines", () => {
    expect(parseHeaderLines("Authorization: Bearer x\n\nX-A:1")).toEqual({
      headers: [
        ["Authorization", "Bearer x"],
        ["X-A", "1"],
      ],
    });
    expect(parseHeaderLines("broken")).toEqual({ error: "Use Header:Value on each line." });
  });
  it("builds the resource tree", () => {
    const m = (...methods: string[]) => Object.fromEntries(methods.map((x) => [x, {}]));
    const tree = resourceTree([
      {
        id: "3",
        parentId: "2",
        path: "/items/{id}",
        pathPart: "{id}",
        resourceMethods: m("DELETE", "GET"),
      },
      {
        id: "2",
        parentId: "1",
        path: "/items",
        pathPart: "items",
        resourceMethods: m("POST", "GET"),
      },
      { id: "4", parentId: "1", path: "/health", pathPart: "health", resourceMethods: m("GET") },
      { id: "1", path: "/", resourceMethods: m("GET") },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe("/");
    expect(tree[0].children.map((c) => c.pathPart)).toEqual(["health", "items"]);
    const items = tree[0].children[1];
    expect(items.methods).toEqual(["GET", "POST"]);
    expect(items.children[0].methods).toEqual(["GET", "DELETE"]);
  });
  it("reads authorizer targets", () => {
    expect(
      cognitoPoolIdOfProviderArn(
        "arn:aws:cognito-idp:ap-southeast-1:000000000000:userpool/ap-southeast-1_Ab12",
      ),
    ).toBe("ap-southeast-1_Ab12");
    const urls = ["http://localhost:4566", "http://localhost.floci.io:4566"];
    expect(isLocalIssuer("http://localhost.floci.io:4566/ap-southeast-1_Ab12", urls)).toBe(true);
    expect(isLocalIssuer("https://cognito-idp.ap-southeast-1.amazonaws.com/x", urls)).toBe(false);
  });
  it("reads API Gateway sources from a function policy", () => {
    const arn = (tail: string) => `arn:aws:execute-api:ap-southeast-1:000000000000:${tail}`;
    const apigw = { Service: "apigateway.amazonaws.com" };
    const cond = (tail: string) => ({ ArnLike: { "AWS:SourceArn": arn(tail) } });
    const policy = JSON.stringify({
      Statement: [
        { Principal: apigw, Condition: cond("a1/*/GET/items/*") },
        { Principal: apigw, Condition: cond("a1/test-invoke-stage/GET/items/*") },
        { Principal: apigw },
        { Principal: { Service: "s3.amazonaws.com" }, Condition: cond("b1/*/GET/x") },
        { Principal: apigw, Condition: cond("k9/*/*") },
      ],
    });
    expect(apiGatewaySourcesOf(policy)).toEqual([
      { apiId: "a1", stage: "*", method: "GET", path: "/items/*" },
      { apiId: "k9", stage: "*", method: "*", path: "" },
    ]);
    expect(apiGatewaySourcesOf("{}")).toEqual([]);
    expect(apiGatewaySourcesOf("not json")).toEqual([]);
  });
  it("builds a WebSocket URL without a default port", () => {
    expect(webSocketUrl("http://localhost", "r", "w1", "prod")).toBe(
      "ws://w1.execute-api.r.localhost.floci.io/prod",
    );
    expect(webSocketUrl("https://host:443", "r", "w1", "prod")).toBe(
      "ws://w1.execute-api.r.localhost.floci.io/prod",
    );
  });
  it("fills missing method and stage with a wildcard", () => {
    const arn = (tail: string) => `arn:aws:execute-api:r:000000000000:${tail}`;
    const stmt = (Service: string | string[], SourceArn: string) => ({
      Principal: { Service },
      Condition: { ArnLike: { "AWS:SourceArn": SourceArn } },
    });
    const policy = JSON.stringify({
      Statement: [
        stmt("apigateway.amazonaws.com", arn("a1/*")),
        stmt(["s3.amazonaws.com", "apigateway.amazonaws.com"], arn("a2/dev/GET/x")),
        stmt("apigateway.amazonaws.com", "arn:aws:s3:::bucket"),
      ],
    });
    expect(apiGatewaySourcesOf(policy)).toEqual([
      { apiId: "a1", stage: "*", method: "*", path: "" },
      { apiId: "a2", stage: "dev", method: "GET", path: "/x" },
    ]);
  });
  it("reads the permission of a Lambda authorizer", () => {
    const policy = JSON.stringify({
      Statement: {
        Principal: { Service: "apigateway.amazonaws.com" },
        Condition: {
          ArnLike: { "AWS:SourceArn": "arn:aws:execute-api:r:000000000000:a1/authorizers/au7" },
        },
      },
    });
    expect(apiGatewaySourcesOf(policy)).toEqual([
      { apiId: "a1", stage: "authorizers", method: "au7", path: "" },
    ]);
  });
  it("keeps the type of other integrations", () => {
    expect(integrationLabel(describeIntegration("AWS_PROXY", undefined))).toBe("AWS_PROXY");
    const fn = "arn:aws:lambda:r:000000000000:function:pre-${stageVariables.x}";
    expect(describeIntegration("AWS_PROXY", fn)).toMatchObject({
      kind: "lambda",
      functionName: undefined,
    });
    expect(integrationLabel({ kind: "lambda", proxy: true }, fn)).toBe(`Lambda proxy → ${fn}`);
  });
  it("returns an empty pool id without the marker", () => {
    expect(cognitoPoolIdOfProviderArn("arn:aws:cognito-idp:r:0:pool/x")).toBe("");
  });
});

describe("method test response", () => {
  const startedAt = performance.now();

  it("formats a JSON body and keeps the status and headers", async () => {
    const response = new Response('{"a":1}', {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    const result = await readTestResponse(response, startedAt);

    expect(result).toMatchObject({
      status: 201,
      body: '{\n  "a": 1\n}',
      headers: [["content-type", "application/json"]],
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps a non-JSON body as text and an empty body as an empty string", async () => {
    const text = await readTestResponse(new Response("Bad Gateway", { status: 502 }), startedAt);
    const empty = await readTestResponse(new Response(null, { status: 404 }), startedAt);

    expect(text.body).toBe("Bad Gateway");
    expect(empty).toMatchObject({ status: 404, body: "" });
  });

  it("hides the body for GET and HEAD only", () => {
    expect(["GET", "HEAD"].some(sendsBody)).toBe(false);
    expect(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"].every(sendsBody)).toBe(true);
  });
});
