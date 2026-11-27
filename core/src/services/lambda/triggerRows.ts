import type { EventSourceMappingConfiguration } from "@aws-sdk/client-lambda";
import { DETAIL_SEPARATOR } from "#shared/constants.ts";
import { isArnOrQualified, lastArnPart } from "#shared/utils/arn.ts";
import type { ApiRow } from "#services/apigateway/apis.ts";
import { AUTHORIZERS_ARN_SEGMENT } from "#services/apigateway/constants.ts";
import type { ApiGatewaySource } from "#services/apigateway/lambdaPermissions.ts";
import { apigatewayRoutes } from "#services/apigateway/paths.ts";
import type { PoolTrigger } from "#services/cognito/operations/pools.ts";
import { cognitoRoutes, POOL_TABS } from "#services/cognito/paths.ts";
import type { EventSources } from "#services/eventbridge/operations/eventSources.ts";
import { eventbridgeRoutes } from "#services/eventbridge/paths.ts";
import type { NotificationRule } from "#services/s3/notificationRules.ts";
import { secretsRoutes } from "#services/secretsmanager/paths.ts";
import { summarizeFilterPolicy } from "#services/sns/filterPolicy.ts";
import type { Subscription } from "#services/sns/topics.ts";
import type { TriggerRowSource } from "./constants.ts";
import { mappingSourceOf } from "./helpers.ts";
import { mappingDetails } from "./mappingOptions.ts";

const ROTATION_DETAILS = "Rotation";

export interface TriggerRow {
  id: string;
  source: TriggerRowSource;
  resource: string; // tên bucket, queue, bảng, stream, topic SNS, rule, schedule hoặc user pool
  details: string;
  rule?: NotificationRule; // S3: rule notification trỏ tới function
  subscriptionArn?: string; // SNS: subscription của topic tới function
  mapping?: EventSourceMappingConfiguration; // SQS, DynamoDB: cấu hình đầy đủ (UUID, State, ARN nguồn), để sửa và bật/tắt
  href?: string; // EventBridge, Scheduler, Cognito, Secrets Manager, API Gateway: link sang trang của nguồn
}

// Rule trỏ tới function, kể cả ARN có version/alias (my-function:prod)
export const targetsFunction = (rule: NotificationRule, functionArn: string) =>
  rule.destination === "lambda" && isArnOrQualified(rule.arn, functionArn);

export const sameRule = (left: NotificationRule, right: NotificationRule) =>
  JSON.stringify(left) === JSON.stringify(right);

export const s3Row = (bucket: string, rule: NotificationRule, index: number): TriggerRow => ({
  id: `s3:${bucket}:${index}`,
  source: "s3",
  resource: bucket,
  details: [rule.events.join(", "), rule.prefix, rule.suffix]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR),
  rule,
});

export function mappingRow(mapping: EventSourceMappingConfiguration): TriggerRow {
  const { source, resource } = mappingSourceOf(mapping.EventSourceArn ?? "");

  return {
    id: `mapping:${mapping.UUID}`,
    source,
    resource,
    details: mappingDetails(source, mapping),
    mapping,
  };
}

export const snsRow = (subscription: Subscription): TriggerRow => ({
  id: `sns:${subscription.arn}`,
  source: "sns",
  resource: lastArnPart(subscription.topicArn),
  details: summarizeFilterPolicy(subscription.filterPolicy),
  subscriptionArn: subscription.arn,
});

export const eventSourceRows = ({ rules, schedules }: EventSources): TriggerRow[] => [
  ...rules.map(({ bus, rule }): TriggerRow => ({
    id: `eventbridge:${bus}/${rule}`,
    source: "eventbridge",
    resource: rule,
    details: `Bus ${bus}`,
    href: eventbridgeRoutes.rule(bus, rule),
  })),
  ...schedules.map(({ group, name }): TriggerRow => ({
    id: `scheduler:${group}/${name}`,
    source: "scheduler",
    resource: name,
    details: `Group ${group}`,
    href: eventbridgeRoutes.schedule(group, name),
  })),
];

// Sửa ở tab Triggers của pool
export const cognitoRow = ({ poolId, poolName, label }: PoolTrigger): TriggerRow => ({
  id: `cognito:${poolId}:${label}`,
  source: "cognito",
  resource: poolName,
  details: label,
  href: cognitoRoutes.pool(poolId, POOL_TABS.triggers),
});

// Sửa ở khối Rotation của secret
export const rotationRow = (name: string): TriggerRow => ({
  id: `secretsmanager:${name}`,
  source: "secretsmanager",
  resource: name,
  details: ROTATION_DETAILS,
  href: secretsRoutes.secret(name),
});

// Permission của Lambda authorizer có dạng <apiId>/authorizers/<authorizerId>, không có method
function triggerDetailsOf({ stage, method, path }: ApiGatewaySource): string {
  if (stage === AUTHORIZERS_ARN_SEGMENT) return `Authorizer ${method}`;
  return [method, path].filter(Boolean).join(" ");
}

// API đã bị xóa thì policy còn nhưng không có hàng trong apis: chỉ hiện ID, không link
export function apigatewayTriggerRows(sources: ApiGatewaySource[], apis: ApiRow[]): TriggerRow[] {
  return sources.map((source): TriggerRow => {
    const { apiId, method, path } = source;
    const api = apis.find(({ id }) => id === apiId);

    return {
      id: `apigateway:${apiId}:${method}:${path}`,
      source: "apigateway",
      resource: api?.name ?? apiId,
      details: triggerDetailsOf(source),
      href: api && apigatewayRoutes.api(api.version, apiId),
    };
  });
}
