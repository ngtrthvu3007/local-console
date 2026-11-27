import { generatePath } from "react-router";
import { DEFAULT_BUS_NAME } from "./constants.ts";

export const EVENTBRIDGE_SERVICE_ID = "eventbridge";
const EVENTBRIDGE_ROOT = `/${EVENTBRIDGE_SERVICE_ID}`;

export const RULE_TABS = { targets: "targets", details: "details" } as const;
export type RuleTab = (typeof RULE_TABS)[keyof typeof RULE_TABS];

// bus: bus đang xem ở trang Rules; tab: tab của chi tiết rule
export const SEARCH_PARAMS = { bus: "bus", group: "group" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
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

// Bus mặc định không ghi lên URL
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
    generatePath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.rule), { bus, rule }),
  editRule: (bus: string, rule: string) =>
    generatePath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.editRule), { bus, rule }),
  schedules: (group?: string) =>
    withParams(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.schedules), groupParams(group)),
  createSchedule: (group?: string) =>
    withParams(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.createSchedule), groupParams(group)),
  schedule: (group: string, name: string) =>
    generatePath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.schedule), { group, name }),
  editSchedule: (group: string, name: string) =>
    generatePath(fullPath(EVENTBRIDGE_ROUTE_PATTERNS.editSchedule), { group, name }),
};

export const busesCrumbs = [
  { text: "Amazon EventBridge", href: eventbridgeRoutes.buses },
  { text: "Event buses", href: eventbridgeRoutes.buses },
];

export const rulesCrumbs = [
  { text: "Amazon EventBridge", href: eventbridgeRoutes.buses },
  { text: "Rules", href: eventbridgeRoutes.rules() },
];

export const ruleCrumbs = (bus: string, rule: string) => [
  ...rulesCrumbs,
  { text: rule, href: eventbridgeRoutes.rule(bus, rule) },
];

export const schedulesCrumbs = [
  { text: "Amazon EventBridge", href: eventbridgeRoutes.buses },
  { text: "Schedules", href: eventbridgeRoutes.schedules() },
];

export const scheduleCrumbs = (group: string, name: string) => [
  ...schedulesCrumbs,
  { text: name, href: eventbridgeRoutes.schedule(group, name) },
];
