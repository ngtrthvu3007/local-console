import type { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";
import { matchesS3Bucket } from "#services/eventbridge/pattern.ts";
import { listBuses } from "./buses.ts";
import { listRules, listTargets } from "./rules.ts";
import { listSchedules } from "./schedules.ts";

// Rule hoặc schedule đẩy vào một resource; bus / group để dựng link
interface RuleSource {
  bus: string;
  rule: string;
}

interface ScheduleSource {
  group: string;
  name: string;
}

export interface EventSources {
  rules: RuleSource[];
  schedules: ScheduleSource[];
}

// Floci 2.4.0 không có ListRuleNamesByTarget nên quét bus → rule → target (local ít, quét song song)
export async function listRuleTargets(client: EventBridgeClient) {
  const perBus = await Promise.all(
    (await listBuses(client)).map(async ({ name: bus }) =>
      Promise.all(
        (await listRules(client, bus)).map(async ({ name: rule }) =>
          (await listTargets(client, bus, rule)).map((target) => ({
            bus,
            rule,
            arn: target.Arn ?? "",
          })),
        ),
      ),
    ),
  );

  return perBus.flat(2);
}

// ListSchedules trả sẵn Target.Arn nên một lượt là đủ
export async function listScheduleTargets(client: SchedulerClient) {
  const rows = await listSchedules(client);
  return rows.map((row) => ({ group: row.group, name: row.name, arn: row.targetArn }));
}

// Rule và schedule có ít nhất một đích khớp `matches`; mỗi rule / schedule chỉ xuất hiện một lần
export async function listEventSources(
  events: EventBridgeClient,
  scheduler: SchedulerClient,
  matches: (targetArn: string) => boolean,
): Promise<EventSources> {
  const [ruleTargets, scheduleTargets] = await Promise.all([
    listRuleTargets(events),
    listScheduleTargets(scheduler),
  ]);

  const rules = new Map<string, RuleSource>();
  for (const { bus, rule, arn } of ruleTargets)
    if (matches(arn)) rules.set(`${bus}/${rule}`, { bus, rule });

  return {
    rules: [...rules.values()],
    schedules: scheduleTargets
      .filter((schedule) => matches(schedule.arn))
      .map(({ group, name }) => ({ group, name })),
  };
}

// Rule ở mọi bus đang bắt event S3 của bucket, để cảnh báo trước khi tắt EventBridge cho bucket
export async function listS3EventRules(events: EventBridgeClient, bucket: string) {
  const perBus = await Promise.all(
    (await listBuses(events)).map((bus) => listRules(events, bus.name)),
  );
  return perBus.flat().filter((rule) => matchesS3Bucket(rule.eventPattern, bucket));
}
