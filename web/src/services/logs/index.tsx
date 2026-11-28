import { Navigate } from "react-router";
import { IconLogs } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { LOGS_ROUTE_PATTERNS, LOGS_SERVICE_ID, logsRoutes } from "@localconsole/core/logs";

export const logsService: ServiceDefinition = {
  id: LOGS_SERVICE_ID,
  name: "CloudWatch Logs",
  fullName: "Amazon CloudWatch Logs",
  description: "Logs of Lambda, ECS, RDS and your apps: search, streams, subscription filters",
  icon: IconLogs,
  category: "management",
  navigation: [{ text: "Log groups", href: logsRoutes.groups }],
  routes: [
    { index: true, element: <Navigate to={logsRoutes.groups} replace /> },
    {
      path: LOGS_ROUTE_PATTERNS.groups,
      ...lazyPage(() => import("./pages/LogGroupList.tsx"), "LogGroupList"),
    },
    {
      path: LOGS_ROUTE_PATTERNS.group,
      ...lazyPage(() => import("./pages/LogGroupDetail.tsx"), "LogGroupDetail"),
    },
    {
      path: LOGS_ROUTE_PATTERNS.stream,
      ...lazyPage(() => import("./pages/LogStream.tsx"), "LogStream"),
    },
  ],
};
