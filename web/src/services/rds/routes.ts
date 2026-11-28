import { rdsRoutes } from "@localconsole/core/rds";

export const rdsBaseCrumbs = [
  { text: "Amazon RDS", href: rdsRoutes.databases },
  { text: "Databases", href: rdsRoutes.databases },
];

export const databaseCrumbs = (database: string) => [
  ...rdsBaseCrumbs,
  { text: database, href: rdsRoutes.database(database) },
];
