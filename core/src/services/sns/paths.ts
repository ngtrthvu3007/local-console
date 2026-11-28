import { fillPath, withTab } from "#shared/utils/paths.ts";

export const SNS_SERVICE_ID = "sns";
const SNS_ROOT = `/${SNS_SERVICE_ID}`;

export const TOPIC_TABS = { subscriptions: "subscriptions", details: "details" } as const;
export type TopicTab = (typeof TOPIC_TABS)[keyof typeof TOPIC_TABS];

export const SEARCH_PARAMS = { phone: "phone" } as const;

export const SNS_ROUTE_PATTERNS = {
  topics: "topics",
  createTopic: "topics/create",
  topic: "topics/:topic",
  sms: "sms",
} as const;

const fullPath = (pattern: string) => `${SNS_ROOT}/${pattern}`;

export const snsRoutes = {
  topics: fullPath(SNS_ROUTE_PATTERNS.topics),
  createTopic: fullPath(SNS_ROUTE_PATTERNS.createTopic),
  sms: fullPath(SNS_ROUTE_PATTERNS.sms),
  topic: (topic: string, tab?: TopicTab) =>
    withTab(fillPath(fullPath(SNS_ROUTE_PATTERNS.topic), { topic }), tab, TOPIC_TABS.subscriptions),
};
