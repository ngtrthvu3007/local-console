import { Navigate } from "react-router";
import { IconBroadcast } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { SNS_ROUTE_PATTERNS, SNS_SERVICE_ID, snsRoutes } from "./routes.ts";

export const snsService: ServiceDefinition = {
  id: SNS_SERVICE_ID,
  name: "SNS",
  fullName: "Amazon SNS",
  description: "Topics: fan out to queues, functions and HTTP endpoints, filter policies, publish",
  icon: IconBroadcast,
  category: "integration",
  navigation: [
    { text: "Topics", href: snsRoutes.topics },
    { text: "Text messaging (SMS)", href: snsRoutes.sms },
  ],
  routes: [
    { index: true, element: <Navigate to={snsRoutes.topics} replace /> },
    {
      path: SNS_ROUTE_PATTERNS.topics,
      ...lazyPage(() => import("./pages/TopicList.tsx"), "TopicList"),
    },
    {
      path: SNS_ROUTE_PATTERNS.createTopic,
      ...lazyPage(() => import("./pages/CreateTopic.tsx"), "CreateTopic"),
    },
    {
      path: SNS_ROUTE_PATTERNS.topic,
      ...lazyPage(() => import("./pages/TopicDetail.tsx"), "TopicDetail"),
    },
    {
      path: SNS_ROUTE_PATTERNS.sms,
      ...lazyPage(() => import("./pages/SmsInbox.tsx"), "SmsInbox"),
    },
  ],
};
