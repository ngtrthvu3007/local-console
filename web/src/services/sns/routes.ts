import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const SNS_SERVICE_ID = "sns";
const SNS_ROOT = `/${SNS_SERVICE_ID}`;

export const TOPIC_TABS = { subscriptions: "subscriptions", details: "details" } as const;
export type TopicTab = (typeof TOPIC_TABS)[keyof typeof TOPIC_TABS];

// phone: điền sẵn ô tìm của hộp thư SMS (link từ service khác, vd: Cognito)
export const SEARCH_PARAMS = { phone: "phone" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
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
  // Tab mặc định (Subscriptions) không ghi lên URL
  topic: (topic: string, tab?: TopicTab) =>
    withTab(
      generatePath(fullPath(SNS_ROUTE_PATTERNS.topic), { topic }),
      tab,
      TOPIC_TABS.subscriptions,
    ),
};

export const snsBaseCrumbs = [
  { text: "Amazon SNS", href: snsRoutes.topics },
  { text: "Topics", href: snsRoutes.topics },
];

export const smsCrumbs = [
  { text: "Amazon SNS", href: snsRoutes.topics },
  { text: "Text messaging (SMS)", href: snsRoutes.sms },
];

export const topicCrumbs = (topic: string) => [
  ...snsBaseCrumbs,
  { text: topic, href: snsRoutes.topic(topic) },
];
