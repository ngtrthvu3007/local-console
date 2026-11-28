import { fillPath } from "#shared/utils/paths.ts";

export const APIGATEWAY_SERVICE_ID = "apigateway";
const APIGATEWAY_ROOT = `/${APIGATEWAY_SERVICE_ID}`;

export const API_VERSIONS = { rest: "v1", v2: "v2" } as const;
export type ApiVersion = (typeof API_VERSIONS)[keyof typeof API_VERSIONS];

export const API_TABS = {
  resources: "resources",
  routes: "routes",
  authorizers: "authorizers",
  stages: "stages",
} as const;
export type ApiTab = (typeof API_TABS)[keyof typeof API_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

export const APIGATEWAY_ROUTE_PATTERNS = {
  apis: "apis",
  create: "apis/create",
  api: ":version/:apiId",
} as const;

const fullPath = (pattern: string) => `${APIGATEWAY_ROOT}/${pattern}`;

export const isApiVersion = (value: string | undefined): value is ApiVersion =>
  value === API_VERSIONS.rest || value === API_VERSIONS.v2;

// REST mở tab Resources, HTTP / WebSocket mở tab Routes
const defaultTab = (version: ApiVersion): ApiTab =>
  version === API_VERSIONS.rest ? API_TABS.resources : API_TABS.routes;

export const apigatewayRoutes = {
  apis: fullPath(APIGATEWAY_ROUTE_PATTERNS.apis),
  create: fullPath(APIGATEWAY_ROUTE_PATTERNS.create),
  api: (version: ApiVersion, apiId: string, tab?: ApiTab) => {
    const path = fillPath(fullPath(APIGATEWAY_ROUTE_PATTERNS.api), { version, apiId });
    return tab && tab !== defaultTab(version)
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};
