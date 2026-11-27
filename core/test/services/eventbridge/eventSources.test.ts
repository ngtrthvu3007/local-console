import { describe, expect, it } from "vitest";
import type { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";
import { isArnOrQualified } from "#shared/utils/arn.ts";
import { listEventSources } from "#services/eventbridge/operations/eventSources.ts";

const QUEUE = "arn:aws:sqs:r:0:orders";
const FUNCTION = "arn:aws:lambda:r:0:function:fn";

// Client giả: trả lời theo tên lệnh
const fakeEvents = (targetsByRule: Record<string, string[]>) =>
  ({
    send: async (command: { constructor: { name: string }; input: Record<string, string> }) => {
      switch (command.constructor.name) {
        case "ListEventBusesCommand":
          return { EventBuses: [{ Name: "default" }, { Name: "orders" }] };
        case "ListRulesCommand":
          return {
            Rules: Object.keys(targetsByRule)
              .filter((key) => key.startsWith(`${command.input.EventBusName}/`))
              .map((key) => ({ Name: key.split("/")[1] })),
          };
        default:
          return {
            Targets: (
              targetsByRule[`${command.input.EventBusName}/${command.input.Rule}`] ?? []
            ).map((arn) => ({ Id: arn, Arn: arn })),
          };
      }
    },
  }) as unknown as EventBridgeClient;

const fakeScheduler = (schedules: { group: string; name: string; arn: string }[]) =>
  ({
    send: async () => ({
      Schedules: schedules.map(({ group, name, arn }) => ({
        Name: name,
        GroupName: group,
        Target: { Arn: arn },
      })),
    }),
  }) as unknown as SchedulerClient;

describe("listEventSources", () => {
  const events = fakeEvents({
    "default/to-queue": [QUEUE],
    "default/to-both": [QUEUE, FUNCTION],
    "orders/other-bus": [QUEUE],
    "default/elsewhere": ["arn:aws:sqs:r:0:other"],
  });
  const scheduler = fakeScheduler([
    { group: "default", name: "tick", arn: QUEUE },
    { group: "jobs", name: "other", arn: "arn:aws:sqs:r:0:other" },
  ]);

  it("finds the rules and schedules that target a resource, across buses and groups", async () => {
    const sources = await listEventSources(events, scheduler, (arn) => arn === QUEUE);
    expect(sources.rules).toEqual([
      { bus: "default", rule: "to-queue" },
      { bus: "default", rule: "to-both" },
      { bus: "orders", rule: "other-bus" },
    ]);
    expect(sources.schedules).toEqual([{ group: "default", name: "tick" }]);
  });

  it("returns a rule once even if it has two targets that match", async () => {
    const twice = fakeEvents({ "default/twice": [FUNCTION, `${FUNCTION}:prod`] });
    const sources = await listEventSources(twice, fakeScheduler([]), (arn) =>
      isArnOrQualified(arn, FUNCTION),
    );
    expect(sources.rules).toEqual([{ bus: "default", rule: "twice" }]);
  });

  it("finds nothing when no rule or schedule points at the resource", async () => {
    const sources = await listEventSources(events, scheduler, (arn) => arn === "arn:none");
    expect(sources).toEqual({ rules: [], schedules: [] });
  });
});
