import { Navigate } from "react-router";
import { IconApi } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  APIGATEWAY_ROUTE_PATTERNS,
  APIGATEWAY_SERVICE_ID,
  apigatewayRoutes,
} from "@localconsole/core/apigateway";

export const apigatewayService: ServiceDefinition = {
  id: APIGATEWAY_SERVICE_ID,
  name: "API Gateway",
  fullName: "Amazon API Gateway",
  description: "REST, HTTP and WebSocket APIs: routes, integrations, authorizers, test requests",
  icon: IconApi,
  category: "integration",
  navigation: [{ text: "APIs", href: apigatewayRoutes.apis }],
  routes: [
    { index: true, element: <Navigate to={apigatewayRoutes.apis} replace /> },
    {
      path: APIGATEWAY_ROUTE_PATTERNS.apis,
      ...lazyPage(() => import("./pages/ApiList.tsx"), "ApiList"),
    },
    {
      path: APIGATEWAY_ROUTE_PATTERNS.api,
      ...lazyPage(() => import("./pages/ApiDetail.tsx"), "ApiDetail"),
    },
  ],
};
