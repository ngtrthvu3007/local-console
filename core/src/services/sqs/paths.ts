import { fillPath, withTab } from "#shared/utils/paths.ts";

export const SQS_SERVICE_ID = "sqs";
const SQS_ROOT = `/${SQS_SERVICE_ID}`;

export const QUEUE_TABS = {
  messages: "messages",
  triggers: "triggers",
  settings: "settings",
} as const;
export type QueueTab = (typeof QUEUE_TABS)[keyof typeof QUEUE_TABS];

export const SEARCH_PARAMS = { message: "message" } as const;

export const SQS_ROUTE_PATTERNS = {
  queues: "queues",
  createQueue: "queues/create",
  queue: "queues/:queue",
} as const;

const fullPath = (pattern: string) => `${SQS_ROOT}/${pattern}`;

export const sqsRoutes = {
  queues: fullPath(SQS_ROUTE_PATTERNS.queues),
  createQueue: fullPath(SQS_ROUTE_PATTERNS.createQueue),
  queue: (queue: string, tab?: QueueTab) =>
    withTab(fillPath(fullPath(SQS_ROUTE_PATTERNS.queue), { queue }), tab, QUEUE_TABS.messages),
};
