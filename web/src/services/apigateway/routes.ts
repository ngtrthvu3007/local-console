import { apigatewayRoutes, type ApiVersion } from "@localconsole/core/apigateway";

export const apigatewayBaseCrumbs = [
  { text: "Amazon API Gateway", href: apigatewayRoutes.apis },
  { text: "APIs", href: apigatewayRoutes.apis },
];

export const apiCrumbs = (version: ApiVersion, apiId: string, name: string) => [
  ...apigatewayBaseCrumbs,
  { text: name, href: apigatewayRoutes.api(version, apiId) },
];
