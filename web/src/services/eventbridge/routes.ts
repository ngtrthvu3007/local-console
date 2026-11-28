import { eventbridgeRoutes } from "@localconsole/core/eventbridge";

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
