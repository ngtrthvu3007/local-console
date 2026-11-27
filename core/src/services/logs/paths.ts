import { withQuery } from "#shared/utils/paths.ts";

export const LOGS_SERVICE_ID = "logs";
const LOGS_ROOT = `/${LOGS_SERVICE_ID}`;

export const GROUP_TABS = {
  search: "search",
  streams: "streams",
  subscriptions: "subscription-filters",
} as const;

// Tên group / stream có "/", "#", "[" nên đi qua query string thay vì path
export const SEARCH_PARAMS = { group: "group", stream: "stream" } as const;

export const LOGS_ROUTE_PATTERNS = {
  groups: "groups",
  group: "groups/detail",
  stream: "groups/stream",
} as const;

const fullPath = (pattern: string) => `${LOGS_ROOT}/${pattern}`;

export const logsRoutes = {
  groups: fullPath(LOGS_ROUTE_PATTERNS.groups),
  group: (name: string) =>
    withQuery(fullPath(LOGS_ROUTE_PATTERNS.group), { [SEARCH_PARAMS.group]: name }),
  stream: (group: string, stream: string) =>
    withQuery(fullPath(LOGS_ROUTE_PATTERNS.stream), {
      [SEARCH_PARAMS.group]: group,
      [SEARCH_PARAMS.stream]: stream,
    }),
};
