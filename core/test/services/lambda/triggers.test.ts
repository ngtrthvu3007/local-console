import { describe, expect, it } from "vitest";
import { apigatewayTriggerRows } from "#services/lambda/triggerRows.ts";
import { functionNameOfArn, mappingSourceOf } from "#services/lambda/helpers.ts";
import { DEFAULT_MAPPING_OPTIONS } from "#services/lambda/mappingOptions.ts";
import { triggerSchema } from "#services/lambda/schemas.ts";

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

// Add trigger › Kinesis (spec Kinesis 3.7): stream bắt buộc, batch size 1–10000
describe("triggerSchema for Kinesis", () => {
  const kinesisTrigger = {
    source: "kinesis" as const,
    bucket: "",
    events: [],
    prefix: "",
    suffix: "",
    queueArn: "",
    table: "",
    stream: `arn:aws:kinesis:${PREFIX}:stream/orders`,
    startingPosition: "LATEST" as const,
    batchSize: "100",
    enabled: true,
    ...DEFAULT_MAPPING_OPTIONS,
  };
  const issuePaths = (values: object) =>
    triggerSchema.safeParse(values).error?.issues.map((issue) => issue.path.join(".")) ?? [];

  it("accepts a stream with a batch size in range", () => {
    expect(issuePaths(kinesisTrigger)).toEqual([]);
    expect(issuePaths({ ...kinesisTrigger, batchSize: "10000" })).toEqual([]);
  });

  it("asks for a data stream", () => {
    expect(issuePaths({ ...kinesisTrigger, stream: "" })).toEqual(["stream"]);
  });

  it("rejects a batch size outside 1–10000", () => {
    expect(issuePaths({ ...kinesisTrigger, batchSize: "0" })).toEqual(["batchSize"]);
    expect(issuePaths({ ...kinesisTrigger, batchSize: "10001" })).toEqual(["batchSize"]);
  });
});
