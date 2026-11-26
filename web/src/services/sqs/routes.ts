import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const SQS_SERVICE_ID = "sqs";
const SQS_ROOT = `/${SQS_SERVICE_ID}`;

export const QUEUE_TABS = {
  messages: "messages",
  triggers: "triggers",
  settings: "settings",
} as const;
export type QueueTab = (typeof QUEUE_TABS)[keyof typeof QUEUE_TABS];

// message: message đang mở ở panel (tab Messages)
export const SEARCH_PARAMS = { message: "message" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const SQS_ROUTE_PATTERNS = {
  queues: "queues",
  createQueue: "queues/create",
  queue: "queues/:queue",
} as const;

const fullPath = (pattern: string) => `${SQS_ROOT}/${pattern}`;

export const sqsRoutes = {
  queues: fullPath(SQS_ROUTE_PATTERNS.queues),
  createQueue: fullPath(SQS_ROUTE_PATTERNS.createQueue),
  // Tab mặc định (Messages) không ghi lên URL
  queue: (queue: string, tab?: QueueTab) =>
    withTab(generatePath(fullPath(SQS_ROUTE_PATTERNS.queue), { queue }), tab, QUEUE_TABS.messages),
};

export const sqsBaseCrumbs = [
  { text: "Amazon SQS", href: sqsRoutes.queues },
  { text: "Queues", href: sqsRoutes.queues },
];

export const queueCrumbs = (queue: string) => [
  ...sqsBaseCrumbs,
  { text: queue, href: sqsRoutes.queue(queue) },
];
