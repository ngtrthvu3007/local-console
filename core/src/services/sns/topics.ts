import type { Subscription as SnsSubscription } from "@aws-sdk/client-sns";
import { lastArnPart } from "#shared/utils/arn.ts";
import { FLOCI_ACCOUNT_ID } from "#shared/constants.ts";
import { ATTRIBUTE_TRUE } from "#services/sqs/constants.ts";
import {
  DEFAULT_FILTER_SCOPE,
  PROTOCOLS,
  SUBSCRIPTION_ATTRIBUTES,
  TOPIC_TYPES,
  type FilterScope,
  type Protocol,
} from "./constants.ts";

export type Attributes = Record<string, string | undefined>;

export interface Topic {
  name: string;
  arn: string;
  fifo: boolean;
  contentBasedDedup: boolean;
  subscriptions: number;
  kmsKeyId?: string;
}

export interface Subscription {
  arn: string;
  topicArn: string;
  protocol: string;
  endpoint: string;
  pending: boolean;
  rawDelivery: boolean;
  filterPolicy?: string;
  filterScope: FilterScope;
}

// Topic không có URL như queue: ARN ghép từ region, account của Floci và tên
export const topicArn = (region: string, name: string) =>
  `arn:aws:sns:${region}:${FLOCI_ACCOUNT_ID}:${name}`;

const numberOf = (value?: string) => Number(value ?? 0);

export function toTopic(arn: string, attributes: Attributes): Topic {
  return {
    name: lastArnPart(arn),
    arn,
    fifo: attributes.FifoTopic === ATTRIBUTE_TRUE,
    contentBasedDedup: attributes.ContentBasedDeduplication === ATTRIBUTE_TRUE,
    subscriptions:
      numberOf(attributes.SubscriptionsConfirmed) + numberOf(attributes.SubscriptionsPending),
    kmsKeyId: attributes.KmsMasterKeyId,
  };
}

export function toSubscription(listed: SnsSubscription, attributes: Attributes): Subscription {
  return {
    arn: listed.SubscriptionArn ?? "",
    topicArn: listed.TopicArn ?? "",
    protocol: listed.Protocol ?? "",
    endpoint: listed.Endpoint ?? "",
    pending: attributes[SUBSCRIPTION_ATTRIBUTES.pending] === ATTRIBUTE_TRUE,
    rawDelivery: attributes[SUBSCRIPTION_ATTRIBUTES.rawDelivery] === ATTRIBUTE_TRUE,
    filterPolicy: attributes[SUBSCRIPTION_ATTRIBUTES.filterPolicy] || undefined,
    filterScope:
      (attributes[SUBSCRIPTION_ATTRIBUTES.filterScope] as FilterScope | undefined) ??
      DEFAULT_FILTER_SCOPE,
  };
}

export const topicTypeLabel = (topic: Topic) => TOPIC_TYPES[topic.fifo ? "fifo" : "standard"];

export const protocolLabel = (protocol: string) =>
  PROTOCOLS[protocol as Protocol] ?? protocol.toUpperCase();
