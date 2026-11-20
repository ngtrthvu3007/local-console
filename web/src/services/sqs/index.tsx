import { Navigate } from "react-router";
import { IconStack2 } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { useQueues } from "./hooks/useQueues.ts";
import { CreateQueue } from "./pages/CreateQueue.tsx";
import { QueueDetail } from "./pages/QueueDetail.tsx";
import { QueueList } from "./pages/QueueList.tsx";
import { SQS_ROUTE_PATTERNS, SQS_SERVICE_ID, sqsRoutes } from "./routes.ts";

export const sqsService: ServiceDefinition = {
  id: SQS_SERVICE_ID,
  name: "SQS",
  fullName: "Amazon SQS",
  description: "Queues: peek and send messages, poll as a consumer, DLQ redrive, Lambda triggers",
  icon: IconStack2,
  category: "integration",
  navigation: [{ text: "Queues", href: sqsRoutes.queues }],
  quickLinks: [{ text: "Create queue", href: sqsRoutes.createQueue }],
  routes: [
    { index: true, element: <Navigate to={sqsRoutes.queues} replace /> },
    { path: SQS_ROUTE_PATTERNS.queues, element: <QueueList /> },
    { path: SQS_ROUTE_PATTERNS.createQueue, element: <CreateQueue /> },
    { path: SQS_ROUTE_PATTERNS.queue, element: <QueueDetail /> },
  ],
  useResourceCount: () => ({ count: useQueues().data?.length, noun: "queue" }),
};
