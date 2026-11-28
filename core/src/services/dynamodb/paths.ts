import { fillPath, withTab } from "#shared/utils/paths.ts";

export const DYNAMODB_SERVICE_ID = "dynamodb";
const DYNAMODB_ROOT = `/${DYNAMODB_SERVICE_ID}`;

export const TABLE_TABS = { items: "items", settings: "settings" } as const;
export type TableTab = (typeof TABLE_TABS)[keyof typeof TABLE_TABS];

export const DYNAMODB_ROUTE_PATTERNS = {
  tables: "tables",
  createTable: "tables/create",
  table: "tables/:table",
} as const;

const fullPath = (pattern: string) => `${DYNAMODB_ROOT}/${pattern}`;

export const dynamodbRoutes = {
  tables: fullPath(DYNAMODB_ROUTE_PATTERNS.tables),
  createTable: fullPath(DYNAMODB_ROUTE_PATTERNS.createTable),
  table: (table: string, tab?: TableTab) =>
    withTab(fillPath(fullPath(DYNAMODB_ROUTE_PATTERNS.table), { table }), tab, TABLE_TABS.items),
};
