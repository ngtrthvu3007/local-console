import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useTopics } from "./hooks/useTopics.ts";
import { CreateTopic } from "./pages/CreateTopic.tsx";
import { TopicDetail } from "./pages/TopicDetail.tsx";
import { TopicList } from "./pages/TopicList.tsx";
import { SNS_ROUTE_PATTERNS, SNS_SERVICE_ID, snsRoutes } from "./routes.ts";

export const snsService: ServiceDefinition = {
  id: SNS_SERVICE_ID,
  name: "SNS",
  fullName: "Amazon SNS",
  description: "Topics: fan out to queues, functions and HTTP endpoints, filter policies, publish",
  iconPath: "/icons/sns.svg",
  navigation: [{ text: "Topics", href: snsRoutes.topics }],
  quickLinks: [{ text: "Create topic", href: snsRoutes.createTopic }],
  routes: [
    { index: true, element: <Navigate to={snsRoutes.topics} replace /> },
    { path: SNS_ROUTE_PATTERNS.topics, element: <TopicList /> },
    { path: SNS_ROUTE_PATTERNS.createTopic, element: <CreateTopic /> },
    { path: SNS_ROUTE_PATTERNS.topic, element: <TopicDetail /> },
  ],
  useResourceCount: () => ({ count: useTopics().data?.length, noun: "topic" }),
};
