import { generatePath } from "react-router";

export const SNS_SERVICE_ID = "sns";
const SNS_ROOT = `/${SNS_SERVICE_ID}`;

export const TOPIC_TABS = { subscriptions: "subscriptions", details: "details" } as const;
export type TopicTab = (typeof TOPIC_TABS)[keyof typeof TOPIC_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const SNS_ROUTE_PATTERNS = {
  topics: "topics",
  createTopic: "topics/create",
  topic: "topics/:topic",
} as const;

const fullPath = (pattern: string) => `${SNS_ROOT}/${pattern}`;

export const snsRoutes = {
  topics: fullPath(SNS_ROUTE_PATTERNS.topics),
  createTopic: fullPath(SNS_ROUTE_PATTERNS.createTopic),
  // Tab mặc định (Subscriptions) không ghi lên URL
  topic: (topic: string, tab?: TopicTab) => {
    const path = generatePath(fullPath(SNS_ROUTE_PATTERNS.topic), { topic });
    return tab && tab !== TOPIC_TABS.subscriptions
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const snsBaseCrumbs = [
  { text: "Amazon SNS", href: snsRoutes.topics },
  { text: "Topics", href: snsRoutes.topics },
];

export const topicCrumbs = (topic: string) => [
  ...snsBaseCrumbs,
  { text: topic, href: snsRoutes.topic(topic) },
];
