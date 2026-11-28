import { dynamodbRoutes } from "@localconsole/core/dynamodb";

export const dynamodbBaseCrumbs = [
  { text: "Amazon DynamoDB", href: dynamodbRoutes.tables },
  { text: "Tables", href: dynamodbRoutes.tables },
];

export const tableCrumbs = (table: string) => [
  ...dynamodbBaseCrumbs,
  { text: table, href: dynamodbRoutes.table(table) },
];
