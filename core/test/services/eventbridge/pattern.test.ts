import { describe, expect, it } from "vitest";
import { matchesS3Bucket, patternError, wrapSampleEvent } from "#services/eventbridge/pattern.ts";
import { ruleSchema, addTargetSchema } from "#services/eventbridge/schemas.ts";
import {
  busNameOfArn,
  qualifierOfArn,
  targetId,
  targetKindOfArn,
} from "#services/eventbridge/targets.ts";

describe("patternError", () => {
  it("accepts a JSON object", () => {
    expect(patternError('{"source": ["my.app"]}')).toBeUndefined();
  });

  it("rejects empty text, broken JSON and non-objects", () => {
    expect(patternError("  ")).toMatch(/Enter an event pattern/);
    expect(patternError("{not json")).toMatch(/Invalid JSON/);
    expect(patternError('["a"]')).toMatch(/JSON object/);
  });
});

describe("wrapSampleEvent", () => {
  it("adds the envelope fields TestEventPattern requires", () => {
    const event = JSON.parse(
      wrapSampleEvent('{"source": "my.app", "detail-type": "X", "detail": {}}', "ap-southeast-1"),
    );
    expect(event).toMatchObject({
      account: "000000000000",
      region: "ap-southeast-1",
      resources: [],
    });
    expect(event.id).toBeTruthy();
    expect(event.source).toBe("my.app");
  });

  it("keeps the fields the developer wrote", () => {
    const event = JSON.parse(
      wrapSampleEvent('{"source": "a", "region": "us-east-1"}', "ap-southeast-1"),
    );
    expect(event.region).toBe("us-east-1");
  });
});

describe("ruleSchema", () => {
  const rule = {
    bus: "default",
    name: "order-created",
    description: "",
    type: "pattern" as const,
    eventPattern: '{"source": ["my.app"]}',
    scheduleExpression: "",
    enabled: true,
  };
  const firstMessage = (input: object) => ruleSchema.safeParse(input).error?.issues[0]?.message;

  it("accepts a pattern rule and a schedule rule on the default bus", () => {
    expect(ruleSchema.safeParse(rule).success).toBe(true);
    expect(
      ruleSchema.safeParse({ ...rule, type: "schedule", scheduleExpression: "rate(5 minutes)" })
        .success,
    ).toBe(true);
  });

  it("rejects bad names and names over 64 characters", () => {
    expect(firstMessage({ ...rule, name: "" })).toMatch(/Enter a rule name/);
    expect(firstMessage({ ...rule, name: "has space" })).toMatch(/Use only letters/);
    expect(ruleSchema.safeParse({ ...rule, name: "a".repeat(65) }).success).toBe(false);
    expect(ruleSchema.safeParse({ ...rule, name: "a".repeat(64) }).success).toBe(true);
  });

  it("rejects an invalid pattern", () => {
    expect(ruleSchema.safeParse({ ...rule, eventPattern: "{oops" }).success).toBe(false);
  });

  it("allows schedule rules on the default bus only", () => {
    const schedule = { ...rule, type: "schedule" as const, scheduleExpression: "rate(1 hour)" };
    expect(firstMessage({ ...schedule, bus: "orders" })).toMatch(/default bus/);
    expect(firstMessage({ ...schedule, scheduleExpression: "every day" })).toMatch(/rate/);
  });
});

describe("addTargetSchema", () => {
  const fifo = new Set(["arn:aws:sqs:r:0:q.fifo"]);
  const input = { kind: "sqs" as const, arn: "arn:aws:sqs:r:0:q.fifo", groupId: "" };

  it("needs a message group ID for FIFO queues only", () => {
    expect(addTargetSchema(fifo).safeParse(input).success).toBe(false);
    expect(addTargetSchema(fifo).safeParse({ ...input, groupId: "g" }).success).toBe(true);
    expect(addTargetSchema(new Set()).safeParse(input).success).toBe(true);
  });

  it("needs a resource", () => {
    expect(addTargetSchema(fifo).safeParse({ ...input, arn: "" }).success).toBe(false);
  });

  // Thiếu network config thì Floci chỉ ghi lỗi vào log của nó, rule vẫn báo thành công (spec ECS 7 #5)
  it("needs a task definition and a subnet for an ECS task", () => {
    const ecs = {
      kind: "ecs" as const,
      arn: "arn:aws:ecs:r:0:cluster/app",
      groupId: "",
      taskFamily: "migrate",
      taskRevision: "2",
      subnets: ["subnet-a"],
      securityGroups: [],
    };
    expect(addTargetSchema(fifo).safeParse(ecs).success).toBe(true);
    expect(addTargetSchema(fifo).safeParse({ ...ecs, taskFamily: "" }).success).toBe(false);
    expect(addTargetSchema(fifo).safeParse({ ...ecs, subnets: [] }).success).toBe(false);
  });
});

describe("targets", () => {
  it("tells the target kind from the ARN", () => {
    expect(targetKindOfArn("arn:aws:lambda:r:0:function:fn")).toBe("lambda");
    expect(targetKindOfArn("arn:aws:sqs:r:0:orders")).toBe("sqs");
    expect(targetKindOfArn("arn:aws:sns:r:0:topic")).toBe("sns");
    expect(targetKindOfArn("arn:aws:states:r:0:stateMachine:flow")).toBe("stepfunctions");
    expect(targetKindOfArn("arn:aws:kinesis:r:0:stream/s")).toBe("kinesis");
    expect(targetKindOfArn("arn:aws:ecs:r:0:cluster/c")).toBe("ecs");
    expect(targetKindOfArn("arn:aws:iam::0:role/r")).toBe("other");
  });

  it("builds an id of at most 64 characters", () => {
    expect(targetId("lambda", "arn:aws:lambda:r:0:function:fn")).toBe("lambda-fn");
    expect(targetId("sqs", `arn:aws:sqs:r:0:${"a".repeat(80)}`)).toHaveLength(64);
    // Bus: lấy tên sau "event-bus/", id target không cho phép dấu /
    expect(targetId("eventbus", "arn:aws:events:r:0:event-bus/orders")).toBe("eventbus-orders");
    expect(targetId("ecs", "arn:aws:ecs:r:0:cluster/app")).toBe("ecs-app");
    // Finding #4: hai target ECS cùng cluster (khác task definition) không được trùng id
    expect(targetId("ecs", "arn:aws:ecs:r:0:cluster/app", "migrate")).toBe("ecs-app-migrate");
  });
});

describe("matchesS3Bucket", () => {
  const rule = (pattern: object) => JSON.stringify(pattern);

  it("matches a rule on source aws.s3 with no bucket filter, or the right bucket", () => {
    expect(matchesS3Bucket(rule({ source: ["aws.s3"] }), "b1")).toBe(true);
    expect(
      matchesS3Bucket(rule({ source: ["aws.s3"], detail: { bucket: { name: ["b1"] } } }), "b1"),
    ).toBe(true);
  });

  it("ignores rules for another source or another bucket", () => {
    expect(matchesS3Bucket(rule({ source: ["my.app"] }), "b1")).toBe(false);
    expect(
      matchesS3Bucket(rule({ source: ["aws.s3"], detail: { bucket: { name: ["b2"] } } }), "b1"),
    ).toBe(false);
  });

  it("is false for a missing or broken pattern", () => {
    expect(matchesS3Bucket(undefined, "b1")).toBe(false);
    expect(matchesS3Bucket("{oops", "b1")).toBe(false);
    expect(matchesS3Bucket(rule({ "detail-type": ["x"] }), "b1")).toBe(false);
  });
});

describe("qualifierOfArn", () => {
  it("returns the version or alias of a function ARN", () => {
    expect(qualifierOfArn("arn:aws:lambda:r:0:function:fn:prod")).toBe("prod");
    expect(qualifierOfArn("arn:aws:lambda:r:0:function:fn")).toBeUndefined();
  });
});

describe("busNameOfArn", () => {
  it("takes the bus name from a bus ARN", () => {
    expect(busNameOfArn("arn:aws:events:r:0:event-bus/orders")).toBe("orders");
    expect(busNameOfArn("arn:aws:events:r:0:event-bus/default")).toBe("default");
  });
});
