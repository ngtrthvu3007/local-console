import { fillPath } from "#shared/utils/paths.ts";
import { DEFAULT_BUS_NAME } from "./constants.ts";

export const EVENTBRIDGE_SERVICE_ID = "eventbridge";
const EVENTBRIDGE_ROOT = `/${EVENTBRIDGE_SERVICE_ID}`;

export const RULE_TABS = { targets: "targets", details: "details" } as const;

export const SEARCH_PARAMS = { bus: "bus", group: "group" } as const;

export const EVENTBRIDGE_ROUTE_PATTERNS = {
  buses: "buses",
  rules: "rules",
  createRule: "rules/create",
  rule: "rules/:bus/:rule",
  editRule: "rules/:bus/:rule/edit",
  schedules: "schedules",
  createSchedule: "schedules/create",
  schedule: "schedules/:group/:name",
  editSchedule: "schedules/:group/:name/edit",
} as const;

const fullPath = (pattern: string) => `${EVENTBRIDGE_ROOT}/${pattern}`;

const withParams = (path: string, params: Record<string, string>) =>
  Object.keys(params).length ? `${path}?${new URLSearchParams(params)}` : path;
const busParams = (bus?: string): Record<string, string> =>
  bus && bus !== DEFAULT_BUS_NAME ? { [SEARCH_PARAMS.bus]: bus } : {};

// Group lọc bảng Schedules; "" là mọi group
const groupParams = (group?: string): Record<string, string> =>
  group ? { [SEARCH_PARAMS.group]: group } : {};

export const eventbridgeRoutes = {
  buses: fullPath(EVENTBRIDGE_ROUTE_PATTERNS.buses),
  rules: (bus?: string) => withParams(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.rules), busParams(bus)),
  createRule: (bus?: string) =>
    withParams(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.createRule), busParams(bus)),
  rule: (bus: string, rule: string) =>
    fillPath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.rule), { bus, rule }),
  editRule: (bus: string, rule: string) =>
    fillPath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.editRule), { bus, rule }),
  schedules: (group?: string) =>
    withParams(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.schedules), groupParams(group)),
  createSchedule: (group?: string) =>
    withParams(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.createSchedule), groupParams(group)),
  schedule: (group: string, name: string) =>
    fillPath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.schedule), { group, name }),
  editSchedule: (group: string, name: string) =>
    fillPath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.editSchedule), { group, name }),
};
