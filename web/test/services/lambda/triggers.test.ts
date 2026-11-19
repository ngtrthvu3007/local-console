import { describe, expect, it } from "vitest";
import { functionNameOfArn } from "../../../src/services/lambda/helpers.ts";
import { mappingSourceOf } from "../../../src/services/lambda/hooks/useTriggers.ts";

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
