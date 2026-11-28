import { Navigate } from "react-router";
import { IconUserShield } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  COGNITO_ROUTE_PATTERNS,
  COGNITO_SERVICE_ID,
  cognitoRoutes,
} from "@localconsole/core/cognito";

export const cognitoService: ServiceDefinition = {
  id: COGNITO_SERVICE_ID,
  name: "Cognito",
  fullName: "Amazon Cognito",
  description:
    "User pools: users, groups, app clients, test sign-in, Lambda triggers and federated sign-in",
  icon: IconUserShield,
  category: "security",
  navigation: [{ text: "User pools", href: cognitoRoutes.pools }],
  routes: [
    { index: true, element: <Navigate to={cognitoRoutes.pools} replace /> },
    {
      path: COGNITO_ROUTE_PATTERNS.pools,
      ...lazyPage(() => import("./pages/PoolList.tsx"), "PoolList"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.pool,
      ...lazyPage(() => import("./pages/PoolDetail.tsx"), "PoolDetail"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.user,
      ...lazyPage(() => import("./pages/UserDetail.tsx"), "UserDetail"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.group,
      ...lazyPage(() => import("./pages/GroupDetail.tsx"), "GroupDetail"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.client,
      ...lazyPage(() => import("./pages/ClientDetail.tsx"), "ClientDetail"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.createClient,
      ...lazyPage(() => import("./pages/ClientForm.tsx"), "ClientForm"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.editClient,
      ...lazyPage(() => import("./pages/ClientForm.tsx"), "ClientForm"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.createProvider,
      ...lazyPage(() => import("./pages/ProviderForm.tsx"), "ProviderForm"),
    },
    {
      path: COGNITO_ROUTE_PATTERNS.editProvider,
      ...lazyPage(() => import("./pages/ProviderForm.tsx"), "ProviderForm"),
    },
  ],
};
