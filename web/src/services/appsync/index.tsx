import { Navigate } from "react-router";
import { IconGraph } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  APPSYNC_ROUTE_PATTERNS,
  APPSYNC_SERVICE_ID,
  appsyncRoutes,
} from "@localconsole/core/appsync";

export const appsyncService: ServiceDefinition = {
  id: APPSYNC_SERVICE_ID,
  name: "AppSync",
  fullName: "AWS AppSync",
  description:
    "GraphQL APIs: schema, resolvers, data sources, run queries with an API key or a user",
  icon: IconGraph,
  category: "integration",
  navigation: [{ text: "APIs", href: appsyncRoutes.apis }],
  routes: [
    { index: true, element: <Navigate to={appsyncRoutes.apis} replace /> },
    {
      path: APPSYNC_ROUTE_PATTERNS.apis,
      ...lazyPage(() => import("./pages/ApiList.tsx"), "ApiList"),
    },
    {
      path: APPSYNC_ROUTE_PATTERNS.createApi,
      ...lazyPage(() => import("./pages/CreateApi.tsx"), "CreateApi"),
    },
    {
      path: APPSYNC_ROUTE_PATTERNS.api,
      ...lazyPage(() => import("./pages/ApiDetail.tsx"), "ApiDetail"),
    },
    {
      path: APPSYNC_ROUTE_PATTERNS.resolver,
      ...lazyPage(() => import("./pages/ResolverPage.tsx"), "ResolverPage"),
    },
    {
      path: APPSYNC_ROUTE_PATTERNS.createFunction,
      ...lazyPage(() => import("./pages/FunctionPage.tsx"), "FunctionPage"),
    },
    {
      path: APPSYNC_ROUTE_PATTERNS.function,
      ...lazyPage(() => import("./pages/FunctionPage.tsx"), "FunctionPage"),
    },
  ],
};
