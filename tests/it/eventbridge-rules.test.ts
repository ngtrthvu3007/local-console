import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  TestEventPatternCommand,
} from "@aws-sdk/client-eventbridge";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole } from "./helpers.ts";

// Đúng các luồng của trang Rules: Test pattern với event bọc đủ trường, sửa rule giữ RoleArn,
// enable/disable, rule theo lịch trên bus default

const ruleName = uniqueName("rule");
const scheduleRuleName = uniqueName("sched");
const busName = uniqueName("rbus");
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-role`;

let region: string;
let events: EventBridgeClient;

// Giống wrapSampleEvent của console: TestEventPattern đòi event đủ trường của envelope
const envelope = (event: object) =>
  JSON.stringify({
    id: "e1",
    account: ACCOUNT_ID,
    time: new Date().toISOString(),
    region,
    resources: [],
    ...event,
  });

const test = async (pattern: object, event: object) =>
  (
    await events.send(
      new TestEventPatternCommand({
        EventPattern: JSON.stringify(pattern),
        Event: envelope(event),
      }),
    )
  ).Result;

beforeAll(async () => {
  region = (await consoleConfig()).region;
  events = new EventBridgeClient(viaConsole(region));
  await events.send(new CreateEventBusCommand({ Name: busName }));
});

afterAll(async () => {
  await events.send(new DeleteRuleCommand({ Name: ruleName })).catch(() => {});
  await events.send(new DeleteRuleCommand({ Name: scheduleRuleName })).catch(() => {});
  await events
    .send(new DeleteRuleCommand({ Name: ruleName, EventBusName: busName }))
    .catch(() => {});
  await events.send(new DeleteEventBusCommand({ Name: busName })).catch(() => {});
});

describe("TestEventPattern", () => {
  it("matches and rejects an event by source", async () => {
    expect(
      await test({ source: ["lc.it"] }, { source: "lc.it", "detail-type": "X", detail: {} }),
    ).toBe(true);
    expect(
      await test({ source: ["lc.it"] }, { source: "other", "detail-type": "X", detail: {} }),
    ).toBe(false);
  });

  it("matches nested detail fields", async () => {
    const event = { source: "lc.it", "detail-type": "X", detail: { order: { status: "paid" } } };
    expect(await test({ detail: { order: { status: ["paid"] } } }, event)).toBe(true);
    expect(await test({ detail: { order: { status: ["new"] } } }, event)).toBe(false);
  });

  // Spec mục 7 #8: Floci 2.4.0 không so khớp numeric
  it("never matches numeric operators on Floci 2.4.0", async () => {
    const event = { source: "lc.it", "detail-type": "X", detail: { amount: 150 } };
    expect(await test({ detail: { amount: [{ numeric: [">", 100] }] } }, event)).toBe(false);
  });
});

describe("rule on the default bus", () => {
  it("keeps the RoleArn when the rule is saved again without it (edit merge)", async () => {
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventPattern: JSON.stringify({ source: ["lc.it"] }),
        RoleArn: ROLE_ARN,
        Description: "first",
      }),
    );
    const before = await events.send(new DescribeRuleCommand({ Name: ruleName }));
    expect(before.RoleArn).toBe(ROLE_ARN);

    // Console sửa rule: request = RoleArn đọc từ DescribeRule + trường của form
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventPattern: JSON.stringify({ source: ["lc.it.changed"] }),
        Description: "second",
        State: "ENABLED",
        RoleArn: before.RoleArn,
      }),
    );
    const after = await events.send(new DescribeRuleCommand({ Name: ruleName }));
    expect(after.RoleArn).toBe(ROLE_ARN);
    expect(after.Description).toBe("second");
    expect(after.EventPattern).toContain("lc.it.changed");
  });

  it("disables and enables a rule", async () => {
    await events.send(new DisableRuleCommand({ Name: ruleName }));
    expect((await events.send(new DescribeRuleCommand({ Name: ruleName }))).State).toBe("DISABLED");
    await events.send(new EnableRuleCommand({ Name: ruleName }));
    expect((await events.send(new DescribeRuleCommand({ Name: ruleName }))).State).toBe("ENABLED");
  });

  it("creates a rate rule and reads the schedule back", async () => {
    await events.send(
      new PutRuleCommand({ Name: scheduleRuleName, ScheduleExpression: "rate(5 minutes)" }),
    );
    const rule = await events.send(new DescribeRuleCommand({ Name: scheduleRuleName }));
    expect(rule.ScheduleExpression).toBe("rate(5 minutes)");
    expect(rule.EventPattern).toBeUndefined();
  });
});

describe("rule on a custom bus", () => {
  // Luật của AWS: rule theo lịch chỉ có trên bus default; console chặn ở form
  it("DescribeRule needs the bus name", async () => {
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName: busName,
        EventPattern: JSON.stringify({ source: ["lc.it"] }),
      }),
    );
    const rule = await events.send(
      new DescribeRuleCommand({ Name: ruleName, EventBusName: busName }),
    );
    expect(rule.Name).toBe(ruleName);
  });
});
