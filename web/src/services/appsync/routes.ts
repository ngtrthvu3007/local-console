import { appsyncRoutes } from "@localconsole/core/appsync";

export const appsyncBaseCrumbs = [
  { text: "AWS AppSync", href: appsyncRoutes.apis },
  { text: "APIs", href: appsyncRoutes.apis },
];

export const apiCrumbs = (apiId: string, name = apiId) => [
  ...appsyncBaseCrumbs,
  { text: name, href: appsyncRoutes.api(apiId) },
];
