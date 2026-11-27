import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const RDS_SERVICE_ID = "rds";
const RDS_ROOT = `/${RDS_SERVICE_ID}`;

export const DATABASE_TABS = {
  connectivity: "connectivity",
  configuration: "configuration",
  logs: "logs",
} as const;
export type DatabaseTab = (typeof DATABASE_TABS)[keyof typeof DATABASE_TABS];

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const RDS_ROUTE_PATTERNS = {
  databases: "databases",
  createDatabase: "databases/create",
  database: "databases/:database",
} as const;

const fullPath = (pattern: string) => `${RDS_ROOT}/${pattern}`;

export const rdsRoutes = {
  databases: fullPath(RDS_ROUTE_PATTERNS.databases),
  createDatabase: fullPath(RDS_ROUTE_PATTERNS.createDatabase),
  // Tab mặc định (Connectivity & security) không ghi lên URL
  database: (database: string, tab?: DatabaseTab) =>
    withTab(
      generatePath(fullPath(RDS_ROUTE_PATTERNS.database), { database }),
      tab,
      DATABASE_TABS.connectivity,
    ),
};

export const rdsBaseCrumbs = [
  { text: "Amazon RDS", href: rdsRoutes.databases },
  { text: "Databases", href: rdsRoutes.databases },
];

export const databaseCrumbs = (database: string) => [
  ...rdsBaseCrumbs,
  { text: database, href: rdsRoutes.database(database) },
];
