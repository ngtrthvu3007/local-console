import { fillPath, withTab } from "#shared/utils/paths.ts";

export const MQ_SERVICE_ID = "mq";
const MQ_ROOT = `/${MQ_SERVICE_ID}`;

export const BROKER_TABS = {
  queues: "queues",
  exchanges: "exchanges",
  details: "details",
} as const;
export type BrokerTab = (typeof BROKER_TABS)[keyof typeof BROKER_TABS];

export const MQ_ROUTE_PATTERNS = {
  brokers: "brokers",
  createBroker: "brokers/create",
  broker: "brokers/:broker",
} as const;

const fullPath = (pattern: string) => `${MQ_ROOT}/${pattern}`;

export const mqRoutes = {
  brokers: fullPath(MQ_ROUTE_PATTERNS.brokers),
  createBroker: fullPath(MQ_ROUTE_PATTERNS.createBroker),
  broker: (broker: string, tab?: BrokerTab) =>
    withTab(fillPath(fullPath(MQ_ROUTE_PATTERNS.broker), { broker }), tab, BROKER_TABS.queues),
};
