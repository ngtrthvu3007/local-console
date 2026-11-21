import { describe, expect, it } from "vitest";
import {
  buildExpression,
  DEFAULT_TIMING,
  parseExpression,
  timingErrors,
} from "../../../src/services/eventbridge/scheduleExpression.ts";
import { createGroupSchema, scheduleSchema } from "../../../src/services/eventbridge/schemas.ts";
import {
  buildTarget,
  editableTargetKind,
  toUpdateInput,
  toScheduleRow,
  type Schedule,
} from "../../../src/services/eventbridge/schedules.ts";

describe("buildExpression", () => {
  it("builds rate with singular and plural units", () => {
    expect(buildExpression({ ...DEFAULT_TIMING, rateValue: "1", rateUnit: "hours" })).toBe(
      "rate(1 hour)",
    );
    expect(buildExpression({ ...DEFAULT_TIMING, rateValue: "5", rateUnit: "minutes" })).toBe(
      "rate(5 minutes)",
    );
    expect(buildExpression({ ...DEFAULT_TIMING, rateValue: "1", rateUnit: "days" })).toBe(
      "rate(1 day)",
    );
  });

  it("builds at and cron", () => {
    expect(buildExpression({ ...DEFAULT_TIMING, kind: "at", atTime: "2030-01-31T09:00:00" })).toBe(
      "at(2030-01-31T09:00:00)",
    );
    expect(buildExpression({ ...DEFAULT_TIMING, kind: "cron", cron: "0 9 ? * MON-FRI *" })).toBe(
      "cron(0 9 ? * MON-FRI *)",
    );
  });
});

describe("parseExpression", () => {
  it("round-trips what buildExpression writes", () => {
    for (const timing of [
      { ...DEFAULT_TIMING, rateValue: "1", rateUnit: "hours" as const },
      { ...DEFAULT_TIMING, rateValue: "30", rateUnit: "minutes" as const },
      { ...DEFAULT_TIMING, kind: "at" as const, atTime: "2030-01-31T09:00:00" },
      { ...DEFAULT_TIMING, kind: "cron" as const, cron: "0 9 ? * MON-FRI *" },
    ])
      expect(parseExpression(buildExpression(timing))).toEqual(timing);
  });

  it("falls back to cron for an expression it can't read", () => {
    expect(parseExpression("weird")).toMatchObject({ kind: "cron", cron: "weird" });
  });
});

describe("timingErrors", () => {
  it("checks each kind", () => {
    expect(timingErrors({ ...DEFAULT_TIMING, rateValue: "0" })).toHaveProperty("rateValue");
    expect(timingErrors({ ...DEFAULT_TIMING, rateValue: "2.5" })).toHaveProperty("rateValue");
    expect(timingErrors({ ...DEFAULT_TIMING, rateValue: "3" })).toEqual({});
    expect(timingErrors({ ...DEFAULT_TIMING, kind: "at", atTime: "tomorrow" })).toHaveProperty(
      "atTime",
    );
    expect(timingErrors({ ...DEFAULT_TIMING, kind: "cron", cron: " " })).toHaveProperty("cron");
  });
});

describe("scheduleSchema", () => {
  const LAMBDA = "arn:aws:lambda:r:0:function:fn";
  const QUEUE_FIFO = "arn:aws:sqs:r:0:q.fifo";
  const form = {
    name: "daily-report",
    group: "default",
    description: "",
    kind: "rate" as const,
    atTime: "",
    rateValue: "5",
    rateUnit: "minutes" as const,
    cron: "",
    timezone: "UTC",
    deleteAfter: true,
    flexMode: "OFF",
    flexMinutes: "5",
    targetKind: "lambda" as const,
    targetArn: LAMBDA,
    groupId: "",
    source: "",
    detailType: "",
    input: "",
    enabled: true,
  };
  const schema = scheduleSchema(new Set([QUEUE_FIFO]));
  const messageAt = (input: object, path: string) =>
    schema.safeParse(input).error?.issues.find((issue) => issue.path[0] === path)?.message;

  it("accepts a rate schedule to a Lambda", () => {
    expect(schema.safeParse(form).success).toBe(true);
  });

  it("checks the name", () => {
    expect(messageAt({ ...form, name: "" }, "name")).toMatch(/Enter a schedule name/);
    expect(messageAt({ ...form, name: "a b" }, "name")).toMatch(/Use only letters/);
    expect(schema.safeParse({ ...form, name: "a".repeat(65) }).success).toBe(false);
  });

  it("needs a target resource and a group ID for a FIFO queue", () => {
    expect(messageAt({ ...form, targetArn: "" }, "targetArn")).toMatch(/Choose a resource/);
    const fifo = { ...form, targetKind: "sqs" as const, targetArn: QUEUE_FIFO };
    expect(messageAt(fifo, "groupId")).toMatch(/group ID/);
    expect(schema.safeParse({ ...fifo, groupId: "g" }).success).toBe(true);
  });

  it("needs JSON input for Lambda and event bus, any text for SQS", () => {
    expect(messageAt({ ...form, input: "not json" }, "input")).toMatch(/Invalid JSON/);
    const sqs = {
      ...form,
      targetKind: "sqs" as const,
      targetArn: "arn:aws:sqs:r:0:q",
      input: "plain text",
    };
    expect(schema.safeParse(sqs).success).toBe(true);
  });

  it("needs source and detail type for an event bus target", () => {
    const bus = {
      ...form,
      targetKind: "eventbus" as const,
      targetArn: "arn:aws:events:r:0:event-bus/b",
    };
    expect(messageAt(bus, "source")).toMatch(/Enter a source/);
    expect(messageAt(bus, "detailType")).toMatch(/detail type/);
  });

  it("skips target checks for a target the form can't edit", () => {
    expect(
      schema.safeParse({ ...form, targetKind: "other", targetArn: "", input: "x" }).success,
    ).toBe(true);
  });

  it("checks the flexible window", () => {
    expect(messageAt({ ...form, flexMode: "FLEXIBLE", flexMinutes: "0" }, "flexMinutes")).toMatch(
      /1 to 1440/,
    );
    expect(schema.safeParse({ ...form, flexMode: "FLEXIBLE", flexMinutes: "15" }).success).toBe(
      true,
    );
  });
});

describe("createGroupSchema", () => {
  it("checks the group name", () => {
    expect(createGroupSchema.safeParse({ name: "jobs" }).success).toBe(true);
    expect(createGroupSchema.safeParse({ name: "my group" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("schedule model", () => {
  const current = {
    Name: "s",
    GroupName: "g",
    Arn: "arn:aws:scheduler:r:0:schedule/g/s",
    ScheduleExpression: "rate(1 hour)",
    State: "ENABLED",
    FlexibleTimeWindow: { Mode: "OFF" },
    KmsKeyArn: "arn:kms",
    Target: {
      Arn: "arn:aws:sqs:r:0:q",
      RoleArn: "arn:aws:iam::0:role/real",
      RetryPolicy: { MaximumRetryAttempts: 3 },
    },
  } as Schedule;

  it("keeps fields the form doesn't have when updating", () => {
    const update = toUpdateInput(current, { State: "DISABLED" });
    expect(update).toMatchObject({
      State: "DISABLED",
      KmsKeyArn: "arn:kms",
      Name: "s",
      GroupName: "g",
    });
    expect(update.Target?.RetryPolicy).toEqual({ MaximumRetryAttempts: 3 });
  });

  it("keeps the real RoleArn and unknown target settings when the target is rebuilt", () => {
    const target = buildTarget({ arn: "arn:aws:sqs:r:0:other", input: "hi" }, current.Target);
    expect(target).toMatchObject({
      Arn: "arn:aws:sqs:r:0:other",
      RoleArn: "arn:aws:iam::0:role/real",
      Input: "hi",
      RetryPolicy: { MaximumRetryAttempts: 3 },
    });
  });

  it("uses the stand-in role for a new target", () => {
    expect(buildTarget({ arn: "arn:aws:sqs:r:0:q", input: "" }).RoleArn).toMatch(
      /role\/lambda-role$/,
    );
  });

  it("tells which targets the form can edit", () => {
    expect(editableTargetKind({ Arn: "arn:aws:lambda:r:0:function:f", RoleArn: "r" })).toBe(
      "lambda",
    );
    expect(
      editableTargetKind({ Arn: "arn:aws:kinesis:r:0:stream/s", RoleArn: "r" }),
    ).toBeUndefined();
  });

  it("maps a list entry", () => {
    expect(
      toScheduleRow({
        Name: "s",
        GroupName: "g",
        State: "DISABLED",
        Target: { Arn: "arn:aws:sqs:r:0:q" },
      }),
    ).toMatchObject({ name: "s", group: "g", enabled: false, targetArn: "arn:aws:sqs:r:0:q" });
  });
});
