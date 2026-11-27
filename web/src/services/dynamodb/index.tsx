import { Navigate } from "react-router";
import { IconDatabase } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  DYNAMODB_ROUTE_PATTERNS,
  DYNAMODB_SERVICE_ID,
  dynamodbRoutes,
} from "@localconsole/core/dynamodb";

export const dynamodbService: ServiceDefinition = {
  id: DYNAMODB_SERVICE_ID,
  name: "DynamoDB",
  fullName: "Amazon DynamoDB",
  description: "Tables: browse, query and edit items, TTL and streams for Lambda",
  icon: IconDatabase,
  category: "database",
  navigation: [{ text: "Tables", href: dynamodbRoutes.tables }],
  routes: [
    { index: true, element: <Navigate to={dynamodbRoutes.tables} replace /> },
    {
      path: DYNAMODB_ROUTE_PATTERNS.tables,
      ...lazyPage(() => import("./pages/TableList.tsx"), "TableList"),
    },
    {
      path: DYNAMODB_ROUTE_PATTERNS.createTable,
      ...lazyPage(() => import("./pages/CreateTable.tsx"), "CreateTable"),
    },
    {
      path: DYNAMODB_ROUTE_PATTERNS.table,
      ...lazyPage(() => import("./pages/TableDetail.tsx"), "TableDetail"),
    },
  ],
};
