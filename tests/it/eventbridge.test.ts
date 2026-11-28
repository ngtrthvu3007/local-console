import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { DeleteQueueCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { consoleConfig, createTestQueue, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Đúng các luồng của trang Event buses: tạo bus, gửi event, rule đẩy vào queue, xóa bus kèm rule

const busName = uniqueName("bus");
const ruleName = uniqueName("rule");
const queueName = uniqueName("eb-queue");
const SOURCE = "lc.it";
const DETAIL_TYPE = "OrderCreated";

let events: EventBridgeClient;
let sqs: SQSClient;
let queueUrl: string;

beforeAll(async () => {
  const { region } = await consoleConfig();
  events = new EventBridgeClient(viaConsole(region));
  sqs = new SQSClient(viaConsole(region));
});

afterAll(async () => {
  // Test có thể dừng giữa chừng: dọn theo cùng thứ tự với console (target → rule → bus)
  await events
    .send(new RemoveTargetsCommand({ EventBusName: busName, Rule: ruleName, Ids: ["queue"] }))
    .catch(() => {});
  await events
    .send(new DeleteRuleCommand({ EventBusName: busName, Name: ruleName }))
    .catch(() => {});
  await events.send(new DeleteEventBusCommand({ Name: busName })).catch(() => {});
  if (queueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
});

const busNames = async () =>
  ((await events.send(new ListEventBusesCommand({}))).EventBuses ?? []).map((bus) => bus.Name);

describe("event bus", () => {
  it("always has the default bus", async () => {
    expect(await busNames()).toContain("default");
  });

  it("creates a bus that shows up in the list with its ARN", async () => {
    await events.send(new CreateEventBusCommand({ Name: busName }));
    const bus = (await events.send(new ListEventBusesCommand({ NamePrefix: busName })))
      .EventBuses?.[0];
    expect(bus?.Name).toBe(busName);
    expect(bus?.Arn).toMatch(new RegExp(`:event-bus/${busName}$`));
  });
});

describe("rule to queue", () => {
  beforeAll(async () => {
    const queue = await createTestQueue(sqs, queueName);
    queueUrl = queue.url;
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName: busName,
        EventPattern: JSON.stringify({ source: [SOURCE] }),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: ruleName,
        EventBusName: busName,
        Targets: [{ Id: "queue", Arn: queue.arn }],
      }),
    );
  });

  it("delivers a matching event to the queue with the sent detail", async () => {
    const result = await events.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: busName,
            Source: SOURCE,
            DetailType: DETAIL_TYPE,
            Detail: '{"order":42}',
          },
        ],
      }),
    );
    expect(result.FailedEntryCount).toBe(0);
    expect(result.Entries?.[0]?.EventId).toBeTruthy();

    const body = await waitFor("event in the queue", async () => {
      const received = await sqs.send(
        new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
      );
      return received.Messages?.[0]?.Body;
    });
    const event = JSON.parse(body);
    expect(event.source).toBe(SOURCE);
    expect(event["detail-type"]).toBe(DETAIL_TYPE);
    expect(event.detail).toEqual({ order: 42 });
  });

  it("lists the rule and its target for the bus", async () => {
    const rules = (await events.send(new ListRulesCommand({ EventBusName: busName }))).Rules ?? [];
    expect(rules.map((rule) => rule.Name)).toEqual([ruleName]);
    const targets = (
      await events.send(new ListTargetsByRuleCommand({ EventBusName: busName, Rule: ruleName }))
    ).Targets;
    expect(targets).toHaveLength(1);
  });

  it("deletes the rule after its targets, then the bus", async () => {
    await events.send(
      new RemoveTargetsCommand({ EventBusName: busName, Rule: ruleName, Ids: ["queue"] }),
    );
    await events.send(new DeleteRuleCommand({ EventBusName: busName, Name: ruleName }));
    await events.send(new DeleteEventBusCommand({ Name: busName }));
    expect(await busNames()).not.toContain(busName);
  });
});
