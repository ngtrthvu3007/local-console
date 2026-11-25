import { generatePath } from "react-router";

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

export const SEARCH_PARAMS = { tab: "tab" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
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
  // Tab mặc định (Schema) không ghi lên URL
  api: (apiId: string, tab?: ApiTab) => {
    const path = generatePath(fullPath(APPSYNC_ROUTE_PATTERNS.api), { apiId });
    return tab && tab !== API_TABS.schema
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
  resolver: (apiId: string, typeName: string, fieldName: string) =>
    generatePath(fullPath(APPSYNC_ROUTE_PATTERNS.resolver), { apiId, typeName, fieldName }),
  createFunction: (apiId: string) =>
    generatePath(fullPath(APPSYNC_ROUTE_PATTERNS.createFunction), { apiId }),
  function: (apiId: string, functionId: string) =>
    generatePath(fullPath(APPSYNC_ROUTE_PATTERNS.function), { apiId, functionId }),
};

export const appsyncBaseCrumbs = [
  { text: "AWS AppSync", href: appsyncRoutes.apis },
  { text: "APIs", href: appsyncRoutes.apis },
];

export const apiCrumbs = (apiId: string, name = apiId) => [
  ...appsyncBaseCrumbs,
  { text: name, href: appsyncRoutes.api(apiId) },
];
