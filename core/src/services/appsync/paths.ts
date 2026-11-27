import { fillPath, withTab } from "#shared/utils/paths.ts";

export const APPSYNC_SERVICE_ID = "appsync";
const APPSYNC_ROOT = `/${APPSYNC_SERVICE_ID}`;

export const API_TABS = {
  schema: "schema",
  dataSources: "data-sources",
  functions: "functions",
  queries: "queries",
  settings: "settings",
} as const;
export type ApiTab = (typeof API_TABS)[keyof typeof API_TABS];

export const APPSYNC_ROUTE_PATTERNS = {
  apis: "apis",
  createApi: "apis/create",
  api: "apis/:apiId",
  resolver: "apis/:apiId/resolvers/:typeName/:fieldName",
  createFunction: "apis/:apiId/functions/create",
  function: "apis/:apiId/functions/:functionId",
} as const;

const fullPath = (pattern: string) => `${APPSYNC_ROOT}/${pattern}`;

export const appsyncRoutes = {
  apis: fullPath(APPSYNC_ROUTE_PATTERNS.apis),
  createApi: fullPath(APPSYNC_ROUTE_PATTERNS.createApi),
  api: (apiId: string, tab?: ApiTab) =>
    withTab(fillPath(fullPath(APPSYNC_ROUTE_PATTERNS.api), { apiId }), tab, API_TABS.schema),
  resolver: (apiId: string, typeName: string, fieldName: string) =>
    fillPath(fullPath(APPSYNC_ROUTE_PATTERNS.resolver), { apiId, typeName, fieldName }),
  createFunction: (apiId: string) =>
    fillPath(fullPath(APPSYNC_ROUTE_PATTERNS.createFunction), { apiId }),
  function: (apiId: string, functionId: string) =>
    fillPath(fullPath(APPSYNC_ROUTE_PATTERNS.function), { apiId, functionId }),
};
