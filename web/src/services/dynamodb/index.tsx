import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useTables } from "./hooks/useTables.ts";
import { CreateTable } from "./pages/CreateTable.tsx";
import { TableDetail } from "./pages/TableDetail.tsx";
import { TableList } from "./pages/TableList.tsx";
import { DYNAMODB_ROUTE_PATTERNS, DYNAMODB_SERVICE_ID, dynamodbRoutes } from "./routes.ts";

export const dynamodbService: ServiceDefinition = {
  id: DYNAMODB_SERVICE_ID,
  name: "DynamoDB",
  fullName: "Amazon DynamoDB",
  description: "Tables: browse, query and edit items, TTL and streams for Lambda",
  iconPath: "/icons/dynamodb.svg",
  navigation: [{ text: "Tables", href: dynamodbRoutes.tables }],
  quickLinks: [{ text: "Create table", href: dynamodbRoutes.createTable }],
  routes: [
    { index: true, element: <Navigate to={dynamodbRoutes.tables} replace /> },
    { path: DYNAMODB_ROUTE_PATTERNS.tables, element: <TableList /> },
    { path: DYNAMODB_ROUTE_PATTERNS.createTable, element: <CreateTable /> },
    { path: DYNAMODB_ROUTE_PATTERNS.table, element: <TableDetail /> },
  ],
  useResourceCount: () => ({ count: useTables().data?.length, noun: "table" }),
};
