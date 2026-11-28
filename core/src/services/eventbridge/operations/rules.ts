import {
  DeleteRuleCommand,
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  TestEventPatternCommand,
  type EventBridgeClient,
  type Target,
} from "@aws-sdk/client-eventbridge";
import { allPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { DEFAULT_ROLE_ARN } from "#services/lambda/constants.ts";
import { RULE_STATES, type RuleType } from "#services/eventbridge/constants.ts";
import { toRule, type Rule } from "#services/eventbridge/rules.ts";
import { ecsParameters, type EcsTarget } from "#services/eventbridge/targets.ts";

export interface RuleRow extends Rule {
  targets: number;
}

export interface PutRuleInput {
  bus: string;
  name: string;
  description: string;
  type: RuleType;
  eventPattern: string;
  scheduleExpression: string;
  enabled: boolean;
}

export interface AddTargetInput {
  arn: string;
  id: string;
  messageGroupId?: string; // queue FIFO
  ecs?: EcsTarget; // target là cluster ECS: chạy task Fargate
}

export interface PatternTestInput {
  pattern: string;
  event: string;
}

export const listRules = (events: EventBridgeClient, bus: string) =>
  allPages(async (nextToken) => {
    const page = await events.send(
      new ListRulesCommand({ EventBusName: bus, NextToken: nextToken }),
    );
    // Floci có thể bỏ EventBusName khỏi kết quả nên gán lại bus đã hỏi
    return {
      items: (page.Rules ?? []).map((rule) => ({ ...toRule(rule), bus })),
      nextToken: page.NextToken,
    };
  });

export const listTargets = (events: EventBridgeClient, bus: string, rule: string) =>
  allPages<Target>(async (nextToken) => {
    const page = await events.send(
      new ListTargetsByRuleCommand({ EventBusName: bus, Rule: rule, NextToken: nextToken }),
    );
    return { items: page.Targets ?? [], nextToken: page.NextToken };
  });

// Local ít rule nên đếm target từng rule song song
export async function listRuleRows(events: EventBridgeClient, bus: string): Promise<RuleRow[]> {
  const rules = await listRules(events, bus);
  return Promise.all(
    rules.map(async (rule) => ({
      ...rule,
      targets: (await listTargets(events, bus, rule.name)).length,
    })),
  );
}

export const getRule = async (events: EventBridgeClient, bus: string, name: string) => ({
  ...toRule(await events.send(new DescribeRuleCommand({ EventBusName: bus, Name: name }))),
  // Floci có thể bỏ EventBusName khỏi kết quả
  bus,
});

// PutRule ghi đè cả rule: sửa thì giữ trường form không có (RoleArn của rule do IaC tạo)
export const putRule = (events: EventBridgeClient, input: PutRuleInput, existing?: Rule) =>
  events.send(
    new PutRuleCommand({
      EventBusName: input.bus,
      Name: input.name,
      Description: input.description || undefined,
      EventPattern: input.type === "pattern" ? input.eventPattern : undefined,
      ScheduleExpression: input.type === "schedule" ? input.scheduleExpression : undefined,
      State: input.enabled ? RULE_STATES.enabled : RULE_STATES.disabled,
      RoleArn: existing?.roleArn,
    }),
  );

export const setRulesEnabled = (
  events: EventBridgeClient,
  rules: readonly Rule[],
  enabled: boolean,
) =>
  runEach(
    rules,
    (rule) => rule.name,
    (rule) => {
      const input = { EventBusName: rule.bus, Name: rule.name };
      return events.send(enabled ? new EnableRuleCommand(input) : new DisableRuleCommand(input));
    },
  );

// AWS không cho xóa rule còn target, nên gỡ hết target trước
export async function deleteRule(events: EventBridgeClient, bus: string, rule: string) {
  const ids = (await listTargets(events, bus, rule)).map((target) => target.Id ?? "");
  if (ids.length)
    await events.send(new RemoveTargetsCommand({ EventBusName: bus, Rule: rule, Ids: ids }));
  await events.send(new DeleteRuleCommand({ EventBusName: bus, Name: rule }));
}

export const deleteRules = (events: EventBridgeClient, rules: readonly Rule[]) =>
  runEach(
    rules,
    (rule) => rule.name,
    (rule) => deleteRule(events, rule.bus, rule.name),
  );

export const testPattern = async (
  events: EventBridgeClient,
  { pattern, event }: PatternTestInput,
) =>
  (await events.send(new TestEventPatternCommand({ EventPattern: pattern, Event: event })))
    .Result === true;

export async function addTarget(
  events: EventBridgeClient,
  bus: string,
  rule: string,
  { arn, id, messageGroupId, ecs }: AddTargetInput,
) {
  const result = await events.send(
    new PutTargetsCommand({
      EventBusName: bus,
      Rule: rule,
      Targets: [
        {
          Id: id,
          Arn: arn,
          SqsParameters: messageGroupId ? { MessageGroupId: messageGroupId } : undefined,
          // AWS bắt buộc role cho target ECS; Floci không kiểm, dùng role thay thế như schedule
          RoleArn: ecs ? DEFAULT_ROLE_ARN : undefined,
          EcsParameters: ecs ? ecsParameters(ecs) : undefined,
        },
      ],
    }),
  );
  // PutTargets báo lỗi từng target ở đây chứ không ném
  if (result.FailedEntryCount)
    throw new Error(result.FailedEntries?.[0]?.ErrorMessage ?? "Couldn't add the target");
}

export const removeTargets = (
  events: EventBridgeClient,
  bus: string,
  rule: string,
  ids: readonly string[],
) => events.send(new RemoveTargetsCommand({ EventBusName: bus, Rule: rule, Ids: [...ids] }));
