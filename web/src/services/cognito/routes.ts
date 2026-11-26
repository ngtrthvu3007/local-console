import { generatePath } from "react-router";
import { SEARCH_PARAMS as SES_SEARCH_PARAMS, sesRoutes } from "../ses/routes.ts";
import { SEARCH_PARAMS as SNS_SEARCH_PARAMS, snsRoutes } from "../sns/routes.ts";
import { withTab } from "@shared/routes.ts";

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

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
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
  // Tab mặc định (Users) không ghi lên URL
  pool: (poolId: string, tab?: PoolTab) =>
    withTab(generatePath(fullPath(COGNITO_ROUTE_PATTERNS.pool), { poolId }), tab, POOL_TABS.users),
  user: (poolId: string, username: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.user), { poolId, username }),
  group: (poolId: string, group: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.group), { poolId, group }),
  client: (poolId: string, clientId: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.client), { poolId, clientId }),
  createClient: (poolId: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.createClient), { poolId }),
  editClient: (poolId: string, clientId: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.editClient), { poolId, clientId }),
  createProvider: (poolId: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.createProvider), { poolId }),
  editProvider: (poolId: string, provider: string) =>
    generatePath(fullPath(COGNITO_ROUTE_PATTERNS.editProvider), { poolId, provider }),
};

export const cognitoBaseCrumbs = [
  { text: "Amazon Cognito", href: cognitoRoutes.pools },
  { text: "User pools", href: cognitoRoutes.pools },
];

export const poolCrumbs = (poolId: string, poolName: string) => [
  ...cognitoBaseCrumbs,
  { text: poolName, href: cognitoRoutes.pool(poolId) },
];

// Mở sẵn Mailbox / hộp thư SMS đã lọc theo người nhận
export const mailboxHref = (email: string) =>
  `${sesRoutes.mailbox}?${new URLSearchParams({ [SES_SEARCH_PARAMS.search]: email })}`;
export const smsHref = (phone: string) =>
  `${snsRoutes.sms}?${new URLSearchParams({ [SNS_SEARCH_PARAMS.phone]: phone })}`;
