import { fillPath, withTab } from "#shared/utils/paths.ts";

export const COGNITO_SERVICE_ID = "cognito";
const COGNITO_ROOT = `/${COGNITO_SERVICE_ID}`;

export const POOL_TABS = {
  users: "users",
  groups: "groups",
  clients: "clients",
  providers: "providers",
  triggers: "triggers",
  details: "details",
} as const;

export type PoolTab = (typeof POOL_TABS)[keyof typeof POOL_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

export const COGNITO_ROUTE_PATTERNS = {
  pools: "user-pools",
  pool: "user-pools/:poolId",
  user: "user-pools/:poolId/users/:username",
  group: "user-pools/:poolId/groups/:group",
  client: "user-pools/:poolId/clients/:clientId",
  createClient: "user-pools/:poolId/clients/create",
  editClient: "user-pools/:poolId/clients/:clientId/edit",
  createProvider: "user-pools/:poolId/providers/create",
  editProvider: "user-pools/:poolId/providers/:provider/edit",
} as const;

const fullPath = (pattern: string) => `${COGNITO_ROOT}/${pattern}`;

export const cognitoRoutes = {
  pools: fullPath(COGNITO_ROUTE_PATTERNS.pools),
  pool: (poolId: string, tab?: PoolTab) =>
    withTab(fillPath(fullPath(COGNITO_ROUTE_PATTERNS.pool), { poolId }), tab, POOL_TABS.users),
  user: (poolId: string, username: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.user), { poolId, username }),
  group: (poolId: string, group: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.group), { poolId, group }),
  client: (poolId: string, clientId: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.client), { poolId, clientId }),
  createClient: (poolId: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.createClient), { poolId }),
  editClient: (poolId: string, clientId: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.editClient), { poolId, clientId }),
  createProvider: (poolId: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.createProvider), { poolId }),
  editProvider: (poolId: string, provider: string) =>
    fillPath(fullPath(COGNITO_ROUTE_PATTERNS.editProvider), { poolId, provider }),
};
