import { Navigate } from "react-router";
import { IconServer } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { RDS_ROUTE_PATTERNS, RDS_SERVICE_ID, rdsRoutes } from "@localconsole/core/rds";

export const rdsService: ServiceDefinition = {
  id: RDS_SERVICE_ID,
  name: "RDS",
  fullName: "Amazon RDS",
  description: "PostgreSQL and MySQL databases: connect from your machine, stop, start, reboot",
  icon: IconServer,
  category: "database",
  navigation: [{ text: "Databases", href: rdsRoutes.databases }],
  routes: [
    { index: true, element: <Navigate to={rdsRoutes.databases} replace /> },
    {
      path: RDS_ROUTE_PATTERNS.databases,
      ...lazyPage(() => import("./pages/DatabaseList.tsx"), "DatabaseList"),
    },
    {
      path: RDS_ROUTE_PATTERNS.createDatabase,
      ...lazyPage(() => import("./pages/CreateDatabase.tsx"), "CreateDatabase"),
    },
    {
      path: RDS_ROUTE_PATTERNS.database,
      ...lazyPage(() => import("./pages/DatabaseDetail.tsx"), "DatabaseDetail"),
    },
  ],
};
