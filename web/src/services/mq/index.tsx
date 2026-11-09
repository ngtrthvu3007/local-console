import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useBrokers } from "./hooks/useBrokers.ts";
import { BrokerDetail } from "./pages/BrokerDetail.tsx";
import { BrokerList } from "./pages/BrokerList.tsx";
import { CreateBroker } from "./pages/CreateBroker.tsx";
import { MQ_ROUTE_PATTERNS, MQ_SERVICE_ID, mqRoutes } from "./routes.ts";

export const mqService: ServiceDefinition = {
  id: MQ_SERVICE_ID,
  name: "Amazon MQ",
  fullName: "Amazon MQ",
  description: "RabbitMQ brokers: queues, publish and peek messages",
  iconPath: "/icons/mq.svg",
  navigation: [{ text: "Brokers", href: mqRoutes.brokers }],
  quickLinks: [{ text: "Create broker", href: mqRoutes.createBroker }],
  routes: [
    { index: true, element: <Navigate to={mqRoutes.brokers} replace /> },
    { path: MQ_ROUTE_PATTERNS.brokers, element: <BrokerList /> },
    { path: MQ_ROUTE_PATTERNS.createBroker, element: <CreateBroker /> },
    { path: MQ_ROUTE_PATTERNS.broker, element: <BrokerDetail /> },
  ],
  useResourceCount: () => ({ count: useBrokers().data?.length, noun: "broker" }),
};
