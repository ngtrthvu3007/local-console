import { Navigate } from "react-router";
import { IconContainer } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { ECS_ROUTE_PATTERNS, ECS_SERVICE_ID, ecsRoutes } from "./routes.ts";

export const ecsService: ServiceDefinition = {
  id: ECS_SERVICE_ID,
  name: "ECS",
  fullName: "Amazon Elastic Container Service",
  description: "Clusters, task definitions, services and tasks run as containers, with their logs",
  icon: IconContainer,
  category: "compute",
  navigation: [
    { text: "Clusters", href: ecsRoutes.clusters },
    { text: "Task definitions", href: ecsRoutes.taskDefinitions },
  ],
  routes: [
    { index: true, element: <Navigate to={ecsRoutes.clusters} replace /> },
    {
      path: ECS_ROUTE_PATTERNS.clusters,
      ...lazyPage(() => import("./pages/ClusterList.tsx"), "ClusterList"),
    },
    {
      path: ECS_ROUTE_PATTERNS.cluster,
      ...lazyPage(() => import("./pages/ClusterDetail.tsx"), "ClusterDetail"),
    },
    {
      path: ECS_ROUTE_PATTERNS.runTask,
      ...lazyPage(() => import("./pages/RunTask.tsx"), "RunTask"),
    },
    {
      path: ECS_ROUTE_PATTERNS.task,
      ...lazyPage(() => import("./pages/TaskDetail.tsx"), "TaskDetail"),
    },
    {
      path: ECS_ROUTE_PATTERNS.createService,
      ...lazyPage(() => import("./pages/CreateService.tsx"), "CreateService"),
    },
    {
      path: ECS_ROUTE_PATTERNS.service,
      ...lazyPage(() => import("./pages/ServiceDetail.tsx"), "ServiceDetail"),
    },
    {
      path: ECS_ROUTE_PATTERNS.taskDefinitions,
      ...lazyPage(() => import("./pages/TaskDefinitionList.tsx"), "TaskDefinitionList"),
    },
    {
      path: ECS_ROUTE_PATTERNS.createTaskDefinition,
      ...lazyPage(() => import("./pages/TaskDefinitionEditor.tsx"), "TaskDefinitionEditor"),
    },
    {
      path: ECS_ROUTE_PATTERNS.family,
      ...lazyPage(() => import("./pages/TaskDefinitionRevisions.tsx"), "TaskDefinitionRevisions"),
    },
    {
      path: ECS_ROUTE_PATTERNS.revision,
      ...lazyPage(() => import("./pages/TaskDefinitionDetail.tsx"), "TaskDefinitionDetail"),
    },
  ],
};
