import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASYNC_INVOCATION,
  destinationKindOf,
  fromInvokeConfig,
  toInvokeParams,
} from "../../../src/services/lambda/asyncInvocation.ts";
import { asyncInvocationSchema } from "../../../src/services/lambda/schemas.ts";

const QUEUE = "arn:aws:sqs:us-east-1:000000000000:done";
const BUS = "arn:aws:events:us-east-1:000000000000:event-bus/default";

describe("destinationKindOf", () => {
  it("reads the kind from the ARN", () => {
    expect(destinationKindOf(QUEUE)).toBe("sqs");
    expect(destinationKindOf(BUS)).toBe("eventbus");
    expect(destinationKindOf("arn:aws:lambda:r:0:function:f")).toBe("lambda");
    expect(destinationKindOf("arn:aws:sns:r:0:t")).toBe("sns");
  });

  it("treats an empty or unsupported ARN as none", () => {
    expect(destinationKindOf("")).toBe("none");
    expect(destinationKindOf(undefined)).toBe("none");
    expect(destinationKindOf("arn:aws:states:r:0:stateMachine:s")).toBe("none");
  });
});

describe("async invocation config", () => {
  it("shows the AWS defaults when nothing is configured", () => {
    expect(fromInvokeConfig(undefined)).toEqual(DEFAULT_ASYNC_INVOCATION);
  });

  it("round-trips a saved config", () => {
    const values = {
      ...DEFAULT_ASYNC_INVOCATION,
      retryAttempts: "0",
      maxEventAge: "3600",
      onFailureKind: "sqs" as const,
      onFailureArn: QUEUE,
    };
    const params = toInvokeParams({
      ...values,
      retryAttempts: 0,
      maxEventAge: 3600,
    });
    expect(params).toEqual({
      MaximumRetryAttempts: 0,
      MaximumEventAgeInSeconds: 3600,
      DestinationConfig: { OnFailure: { Destination: QUEUE } },
    });
    expect(fromInvokeConfig({ ...params })).toEqual(values);
  });
});

describe("asyncInvocationSchema", () => {
  const base = { ...DEFAULT_ASYNC_INVOCATION };
  const messageAt = (input: object, path: string) =>
    asyncInvocationSchema
      .safeParse(input)
      .error?.issues.find((issue) => issue.path.join(".") === path)?.message;

  it("accepts the defaults", () => {
    expect(asyncInvocationSchema.safeParse(base).success).toBe(true);
  });

  it("limits retries to 0–2 and the event age to 60–21600 seconds", () => {
    expect(messageAt({ ...base, retryAttempts: "3" }, "retryAttempts")).toBeTruthy();
    expect(messageAt({ ...base, retryAttempts: "0" }, "retryAttempts")).toBeUndefined();
    expect(messageAt({ ...base, maxEventAge: "59" }, "maxEventAge")).toBeTruthy();
    expect(messageAt({ ...base, maxEventAge: "21601" }, "maxEventAge")).toBeTruthy();
  });

  it("needs a resource once a destination kind is chosen", () => {
    expect(messageAt({ ...base, onSuccessKind: "sqs" }, "onSuccessArn")).toBeTruthy();
    expect(messageAt({ ...base, onFailureKind: "lambda" }, "onFailureArn")).toBeTruthy();
    expect(messageAt({ ...base, onFailureKind: "none" }, "onFailureArn")).toBeUndefined();
  });
});
