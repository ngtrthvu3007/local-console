import { fillPath, withTab } from "#shared/utils/paths.ts";

export const RDS_SERVICE_ID = "rds";
const RDS_ROOT = `/${RDS_SERVICE_ID}`;

export const DATABASE_TABS = {
  connectivity: "connectivity",
  configuration: "configuration",
  logs: "logs",
} as const;
export type DatabaseTab = (typeof DATABASE_TABS)[keyof typeof DATABASE_TABS];

export const RDS_ROUTE_PATTERNS = {
  databases: "databases",
  createDatabase: "databases/create",
  database: "databases/:database",
} as const;

const fullPath = (pattern: string) => `${RDS_ROOT}/${pattern}`;

export const rdsRoutes = {
  databases: fullPath(RDS_ROUTE_PATTERNS.databases),
  createDatabase: fullPath(RDS_ROUTE_PATTERNS.createDatabase),
  database: (database: string, tab?: DatabaseTab) =>
    withTab(
      fillPath(fullPath(RDS_ROUTE_PATTERNS.database), { database }),
      tab,
      DATABASE_TABS.connectivity,
    ),
};
