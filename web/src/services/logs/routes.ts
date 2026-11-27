import { logsRoutes } from "@localconsole/core/logs";

export const logsBaseCrumbs = [
  { text: "Amazon CloudWatch Logs", href: logsRoutes.groups },
  { text: "Log groups", href: logsRoutes.groups },
];

export const groupCrumbs = (name: string) => [
  ...logsBaseCrumbs,
  { text: name, href: logsRoutes.group(name) },
];
