import { Navigate } from "react-router";
import { IconStack2 } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { SQS_ROUTE_PATTERNS, SQS_SERVICE_ID, sqsRoutes } from "./routes.ts";

export const sqsService: ServiceDefinition = {
  id: SQS_SERVICE_ID,
  name: "SQS",
  fullName: "Amazon SQS",
  description:
    "Queues: peek and send messages, poll as a consumer, DLQ redrive, Lambda triggers",
  icon: IconStack2,
  category: "integration",
  navigation: [{ text: "Queues", href: sqsRoutes.queues }],
  routes: [
    { index: true, element: <Navigate to={sqsRoutes.queues} replace /> },
    {
      path: SQS_ROUTE_PATTERNS.queues,
      ...lazyPage(() => import("./pages/QueueList.tsx"), "QueueList"),
    },
    {
      path: SQS_ROUTE_PATTERNS.createQueue,
      ...lazyPage(() => import("./pages/CreateQueue.tsx"), "CreateQueue"),
    },
    {
      path: SQS_ROUTE_PATTERNS.queue,
      ...lazyPage(() => import("./pages/QueueDetail.tsx"), "QueueDetail"),
    },
  ],
};
