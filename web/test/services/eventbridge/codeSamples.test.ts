import { describe, expect, it } from "vitest";
import { ruleSample, scheduleSample } from "../../../src/services/eventbridge/codeSamples.ts";
import type { Rule, Schedule } from "@localconsole/core/eventbridge";

describe("ruleSample", () => {
  const rule: Rule = { name: "r", bus: "orders", arn: "arn", enabled: true };

  it("puts an event on the bus of the rule, in Node.js and Python", () => {
    const sample = ruleSample(rule);
    expect(sample.node).toContain('EventBusName: "orders"');
    expect(sample.python).toContain('"EventBusName": "orders"');
  });
});

describe("scheduleSample", () => {
  const schedule = {
    Name: "daily",
    GroupName: "jobs",
    ScheduleExpression: "cron(0 9 ? * MON-FRI *)",
    Target: { Arn: "arn:aws:sqs:r:0:q", RoleArn: "arn:aws:iam::0:role/x" },
  } as Schedule;

  it("creates a schedule like this one, with its group, expression and target", () => {
    const { node, python } = scheduleSample(schedule);
    for (const code of [node, python]) {
      expect(code).toContain('"daily"');
      expect(code).toContain('"jobs"');
      expect(code).toContain('"cron(0 9 ? * MON-FRI *)"');
      expect(code).toContain('"arn:aws:sqs:r:0:q"');
    }
  });
});
