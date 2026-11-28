import { describe, expect, it } from "vitest";
import { isArnOrQualified, lastArnPart } from "#shared/utils/arn.ts";

const FUNCTION = "arn:aws:lambda:r:0:function:fn";

describe("ARN helpers", () => {
  it("takes the resource name from the end of an ARN", () => {
    expect(lastArnPart(FUNCTION)).toBe("fn");
    expect(lastArnPart("arn:aws:sqs:ap-southeast-1:000000000000:orders-dlq")).toBe("orders-dlq");
  });

  it("matches a function ARN, with or without a version or alias", () => {
    expect(isArnOrQualified(FUNCTION, FUNCTION)).toBe(true);
    expect(isArnOrQualified(`${FUNCTION}:prod`, FUNCTION)).toBe(true);
    expect(isArnOrQualified(`${FUNCTION}-2`, FUNCTION)).toBe(false);
  });
});
