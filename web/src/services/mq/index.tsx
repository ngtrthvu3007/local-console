import { Navigate } from "react-router";
import { IconArrowsExchange } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { MQ_ROUTE_PATTERNS, MQ_SERVICE_ID, mqRoutes } from "@localconsole/core/mq";

export const mqService: ServiceDefinition = {
  id: MQ_SERVICE_ID,
  name: "Amazon MQ",
  fullName: "Amazon MQ",
  description: "RabbitMQ brokers: queues, publish and peek messages",
  icon: IconArrowsExchange,
  category: "integration",
  navigation: [{ text: "Brokers", href: mqRoutes.brokers }],
  routes: [
    { index: true, element: <Navigate to={mqRoutes.brokers} replace /> },
    {
      path: MQ_ROUTE_PATTERNS.brokers,
      ...lazyPage(() => import("./pages/BrokerList.tsx"), "BrokerList"),
    },
    {
      path: MQ_ROUTE_PATTERNS.createBroker,
      ...lazyPage(() => import("./pages/CreateBroker.tsx"), "CreateBroker"),
    },
    {
      path: MQ_ROUTE_PATTERNS.broker,
      ...lazyPage(() => import("./pages/BrokerDetail.tsx"), "BrokerDetail"),
    },
  ],
};
