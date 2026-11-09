import type {
  Event,
  FilterRule,
  NotificationConfiguration,
  NotificationConfigurationFilter,
} from "@aws-sdk/client-s3";
import { FILTER_RULE_NAMES, type NotificationDestination } from "./constants.ts";

// S3 lưu notification thành 3 mảng theo loại đích; UI gộp lại thành một danh sách
export interface NotificationRule {
  id: string;
  destination: NotificationDestination;
  arn: string;
  events: Event[];
  prefix?: string;
  suffix?: string;
}

const filterValue = (filter: NotificationConfigurationFilter | undefined, name: string) =>
  filter?.Key?.FilterRules?.find((rule) => rule.Name?.toLowerCase() === name)?.Value;

function toFilter({
  prefix,
  suffix,
}: NotificationRule): NotificationConfigurationFilter | undefined {
  const rules: FilterRule[] = [];
  if (prefix) rules.push({ Name: FILTER_RULE_NAMES.prefix, Value: prefix });
  if (suffix) rules.push({ Name: FILTER_RULE_NAMES.suffix, Value: suffix });
  return rules.length ? { Key: { FilterRules: rules } } : undefined;
}

interface RawRule {
  Id?: string;
  Events?: Event[];
  Filter?: NotificationConfigurationFilter;
}

const fromRaw = (
  raw: RawRule,
  destination: NotificationDestination,
  arn: string,
): NotificationRule => ({
  id: raw.Id ?? "",
  destination,
  arn,
  events: raw.Events ?? [],
  prefix: filterValue(raw.Filter, FILTER_RULE_NAMES.prefix),
  suffix: filterValue(raw.Filter, FILTER_RULE_NAMES.suffix),
});

export function toNotificationRules(
  configuration: NotificationConfiguration = {},
): NotificationRule[] {
  return [
    ...(configuration.LambdaFunctionConfigurations ?? []).map((raw) =>
      fromRaw(raw, "lambda", raw.LambdaFunctionArn!),
    ),
    ...(configuration.QueueConfigurations ?? []).map((raw) => fromRaw(raw, "sqs", raw.QueueArn!)),
    ...(configuration.TopicConfigurations ?? []).map((raw) => fromRaw(raw, "sns", raw.TopicArn!)),
  ];
}

export function toNotificationConfiguration(rules: NotificationRule[]): NotificationConfiguration {
  const common = (rule: NotificationRule) => ({
    Id: rule.id || undefined,
    Events: rule.events,
    Filter: toFilter(rule),
  });
  const byDestination = (destination: NotificationDestination) =>
    rules.filter((rule) => rule.destination === destination);
  return {
    LambdaFunctionConfigurations: byDestination("lambda").map((rule) => ({
      ...common(rule),
      LambdaFunctionArn: rule.arn,
    })),
    QueueConfigurations: byDestination("sqs").map((rule) => ({
      ...common(rule),
      QueueArn: rule.arn,
    })),
    TopicConfigurations: byDestination("sns").map((rule) => ({
      ...common(rule),
      TopicArn: rule.arn,
    })),
  };
}
