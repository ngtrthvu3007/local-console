import { ssmRoutes } from "@localconsole/core/ssm";

export const ssmBaseCrumbs = [
  { text: "AWS Systems Manager", href: ssmRoutes.parameters },
  { text: "Parameter Store", href: ssmRoutes.parameters },
];

export const parameterCrumbs = (name: string) => [
  ...ssmBaseCrumbs,
  { text: name, href: ssmRoutes.parameter(name) },
];
