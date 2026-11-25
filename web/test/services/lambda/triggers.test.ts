import { describe, expect, it } from "vitest";
import { functionNameOfArn } from "../../../src/services/lambda/helpers.ts";
import { mappingSourceOf } from "../../../src/services/lambda/hooks/useTriggers.ts";
import { DEFAULT_MAPPING_OPTIONS } from "../../../src/services/lambda/mappingOptions.ts";
import { triggerSchema } from "../../../src/services/lambda/schemas.ts";

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
