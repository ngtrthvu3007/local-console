import { RULE_STATES, type RuleType } from "./constants.ts";

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
