import { generatePath } from "react-router";

export const MQ_SERVICE_ID = "mq";
const MQ_ROOT = `/${MQ_SERVICE_ID}`;

export const BROKER_TABS = {
  queues: "queues",
  exchanges: "exchanges",
  details: "details",
} as const;
export type BrokerTab = (typeof BROKER_TABS)[keyof typeof BROKER_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const MQ_ROUTE_PATTERNS = {
  brokers: "brokers",
  createBroker: "brokers/create",
  broker: "brokers/:broker",
} as const;

const fullPath = (pattern: string) => `${MQ_ROOT}/${pattern}`;

export const mqRoutes = {
  brokers: fullPath(MQ_ROUTE_PATTERNS.brokers),
  createBroker: fullPath(MQ_ROUTE_PATTERNS.createBroker),
  // Tab mặc định (Queues) không ghi lên URL
  broker: (broker: string, tab?: BrokerTab) => {
    const path = generatePath(fullPath(MQ_ROUTE_PATTERNS.broker), { broker });
    return tab && tab !== BROKER_TABS.queues
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const mqBaseCrumbs = [
  { text: "Amazon MQ", href: mqRoutes.brokers },
  { text: "Brokers", href: mqRoutes.brokers },
];

export const brokerCrumbs = (broker: string, name: string) => [
  ...mqBaseCrumbs,
  { text: name, href: mqRoutes.broker(broker) },
];
