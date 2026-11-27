import { describe, expect, it } from "vitest";
import { functionNameOfArn } from "../../../src/services/lambda/helpers.ts";
import { apigatewayTriggerRows, mappingSourceOf } from "../../../src/services/lambda/hooks/useTriggers.ts";

const PREFIX = "ap-southeast-1:000000000000";

describe("mappingSourceOf", () => {
  it("reads the source and resource from the event source ARN", () => {
    expect(mappingSourceOf(`arn:aws:sqs:${PREFIX}:orders`)).toEqual({
      source: "sqs",
      resource: "orders",
    });
    expect(
      mappingSourceOf(`arn:aws:dynamodb:${PREFIX}:table/orders/stream/2026-11-19T00:00:00.000`),
    ).toEqual({ source: "dynamodb", resource: "orders" });
    expect(mappingSourceOf(`arn:aws:kinesis:${PREFIX}:stream/clicks`)).toEqual({
      source: "kinesis",
      resource: "clicks",
    });
  });
});

describe("functionNameOfArn", () => {
  it("drops the version or alias", () => {
    expect(functionNameOfArn(`arn:aws:lambda:${PREFIX}:function:resize`)).toBe("resize");
    expect(functionNameOfArn(`arn:aws:lambda:${PREFIX}:function:resize:prod`)).toBe("resize");
  });
});

describe("apigatewayTriggerRows", () => {
  const sources = [
    { apiId: "a1", stage: "*", method: "GET", path: "/items/*" },
    { apiId: "k9", stage: "*", method: "*", path: "/*" },
    { apiId: "gone", stage: "*", method: "POST", path: "/x" },
  ];
  const apis = [
    { id: "a1", name: "orders-rest", version: "v1", type: "REST" },
    { id: "k9", name: "orders-http", version: "v2", type: "HTTP" },
  ] as const;

  it("links each source to its API page by version", () => {
    expect(apigatewayTriggerRows(sources, [...apis]).slice(0, 2)).toEqual([
      {
        id: "apigateway:a1:GET:/items/*",
        source: "apigateway",
        resource: "orders-rest",
        details: "GET /items/*",
        href: "/apigateway/v1/a1",
      },
      {
        id: "apigateway:k9:*:/*",
        source: "apigateway",
        resource: "orders-http",
        details: "* /*",
        href: "/apigateway/v2/k9",
      },
    ]);
  });

  it("shows a deleted API as its ID without a link", () => {
    const [deleted] = apigatewayTriggerRows([sources[2]], [...apis]);

    expect(deleted).toMatchObject({ resource: "gone", details: "POST /x" });
    expect(deleted.href).toBeUndefined();
  });

  it("names the authorizer instead of a method for an authorizer permission", () => {
    const [row] = apigatewayTriggerRows(
      [{ apiId: "a1", stage: "authorizers", method: "au7", path: "" }],
      [...apis],
    );

    expect(row).toMatchObject({ resource: "orders-rest", details: "Authorizer au7" });
  });
});
