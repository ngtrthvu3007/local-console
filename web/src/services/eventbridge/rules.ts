import { RULE_STATES, type RuleType } from "./constants.ts";
import {
  DeleteRuleCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
  type EventBridgeClient,
  type Target,
} from "@aws-sdk/client-eventbridge";
import { allPages } from "@shared/aws.ts";

export const listRules = (client: EventBridgeClient, bus: string) =>
  allPages(async (nextToken) => {
    const page = await client.send(
      new ListRulesCommand({ EventBusName: bus, NextToken: nextToken }),
    );
    // Floci có thể bỏ EventBusName khỏi kết quả nên gán lại bus đã hỏi
    return {
      items: (page.Rules ?? []).map((rule) => ({ ...toRule(rule), bus })),
      nextToken: page.NextToken,
    };
  });

export const listTargets = (client: EventBridgeClient, bus: string, rule: string) =>
  allPages<Target>(async (nextToken) => {
    const page = await client.send(
      new ListTargetsByRuleCommand({ EventBusName: bus, Rule: rule, NextToken: nextToken }),
    );
    return { items: page.Targets ?? [], nextToken: page.NextToken };
  });

// AWS không cho xóa rule còn target, nên gỡ hết target trước
export async function deleteRule(client: EventBridgeClient, bus: string, rule: string) {
  const ids = (await listTargets(client, bus, rule)).map((target) => target.Id ?? "");
  if (ids.length)
    await client.send(new RemoveTargetsCommand({ EventBusName: bus, Rule: rule, Ids: ids }));
  await client.send(new DeleteRuleCommand({ EventBusName: bus, Name: rule }));
}

export interface Rule {
  name: string;
  bus: string;
  arn: string;
  description?: string;
  eventPattern?: string;
  scheduleExpression?: string;
  roleArn?: string;
  enabled: boolean;
}

// Hình chung của một phần tử ListRules và kết quả DescribeRule
interface RuleLike {
  Name?: string;
  EventBusName?: string;
  Arn?: string;
  Description?: string;
  EventPattern?: string;
  ScheduleExpression?: string;
  RoleArn?: string;
  State?: string;
}

export const toRule = (rule: RuleLike): Rule => ({
  name: rule.Name ?? "",
  bus: rule.EventBusName ?? "",
  arn: rule.Arn ?? "",
  description: rule.Description || undefined,
  eventPattern: rule.EventPattern || undefined,
  scheduleExpression: rule.ScheduleExpression || undefined,
  roleArn: rule.RoleArn || undefined,
  enabled: rule.State === RULE_STATES.enabled,
});

export const ruleType = (rule: Rule): RuleType =>
  rule.scheduleExpression ? "schedule" : "pattern";
