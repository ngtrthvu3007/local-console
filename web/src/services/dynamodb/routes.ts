import { generatePath } from "react-router";

export const DYNAMODB_SERVICE_ID = "dynamodb";
const DYNAMODB_ROOT = `/${DYNAMODB_SERVICE_ID}`;

export const TABLE_TABS = { items: "items", settings: "settings" } as const;
export type TableTab = (typeof TABLE_TABS)[keyof typeof TABLE_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const DYNAMODB_ROUTE_PATTERNS = {
  tables: "tables",
  createTable: "tables/create",
  table: "tables/:table",
} as const;

const fullPath = (pattern: string) => `${DYNAMODB_ROOT}/${pattern}`;

export const dynamodbRoutes = {
  tables: fullPath(DYNAMODB_ROUTE_PATTERNS.tables),
  createTable: fullPath(DYNAMODB_ROUTE_PATTERNS.createTable),
  // Tab mặc định (Items) không ghi lên URL
  table: (table: string, tab?: TableTab) => {
    const path = generatePath(fullPath(DYNAMODB_ROUTE_PATTERNS.table), { table });
    return tab && tab !== TABLE_TABS.items
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const dynamodbBaseCrumbs = [
  { text: "Amazon DynamoDB", href: dynamodbRoutes.tables },
  { text: "Tables", href: dynamodbRoutes.tables },
];

export const tableCrumbs = (table: string) => [
  ...dynamodbBaseCrumbs,
  { text: table, href: dynamodbRoutes.table(table) },
];
