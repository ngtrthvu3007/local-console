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

// Phải truyền current: ghi đè thiếu sẽ mất EventBridgeConfiguration do CDK / app bật. eventBridge trống = giữ nguyên
export function toNotificationConfiguration(
  rules: NotificationRule[],
  current: NotificationConfiguration = {},
  eventBridge: boolean = Boolean(current.EventBridgeConfiguration),
): NotificationConfiguration {
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
    ...(eventBridge && { EventBridgeConfiguration: current.EventBridgeConfiguration ?? {} }),
  };
}

// AWS từ chối (Floci thì không) 2 rule cùng loại event có prefix / suffix chồng nhau, bất kể đích
const WILDCARD = "*";
const coversEvent = (wide: string, event: string) =>
  wide === event || (wide.endsWith(WILDCARD) && event.startsWith(wide.slice(0, -WILDCARD.length)));
const nested = (a = "", b = "", contains: (outer: string, inner: string) => boolean) =>
  contains(a, b) || contains(b, a);

export const overlappingRule = (
  rules: readonly NotificationRule[],
  rule: Pick<NotificationRule, "events" | "prefix" | "suffix">,
) =>
  rules.find(
    (other) =>
      other.events.some((a) => rule.events.some((b) => coversEvent(a, b) || coversEvent(b, a))) &&
      nested(other.prefix, rule.prefix, (outer, inner) => outer.startsWith(inner)) &&
      nested(other.suffix, rule.suffix, (outer, inner) => outer.endsWith(inner)),
  );

export const overlapMessage = (other: NotificationRule) =>
  `Overlaps ${other.id || other.arn}: same event type and overlapping prefix/suffix. AWS rejects this.`;
