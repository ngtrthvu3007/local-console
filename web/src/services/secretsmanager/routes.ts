import { secretsRoutes } from "@localconsole/core/secretsmanager";

export const secretsBaseCrumbs = [
  { text: "AWS Secrets Manager", href: secretsRoutes.secrets },
  { text: "Secrets", href: secretsRoutes.secrets },
];

export const secretCrumbs = (name: string) => [
  ...secretsBaseCrumbs,
  { text: name, href: secretsRoutes.secret(name) },
];
