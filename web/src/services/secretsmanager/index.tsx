import { Navigate } from "react-router";
import { IconKey } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { SECRETS_ROUTE_PATTERNS, SECRETS_SERVICE_ID, secretsRoutes } from "./routes.ts";

export const secretsManagerService: ServiceDefinition = {
  id: SECRETS_SERVICE_ID,
  name: "Secrets Manager",
  fullName: "AWS Secrets Manager",
  description: "Secrets: store, retrieve and edit values, rotate them with a Lambda function",
  icon: IconKey,
  category: "security",
  navigation: [{ text: "Secrets", href: secretsRoutes.secrets }],
  routes: [
    { index: true, element: <Navigate to={secretsRoutes.secrets} replace /> },
    {
      path: SECRETS_ROUTE_PATTERNS.secrets,
      ...lazyPage(() => import("./pages/SecretList.tsx"), "SecretList"),
    },
    {
      path: SECRETS_ROUTE_PATTERNS.createSecret,
      ...lazyPage(() => import("./pages/CreateSecret.tsx"), "CreateSecret"),
    },
    {
      path: SECRETS_ROUTE_PATTERNS.secret,
      ...lazyPage(() => import("./pages/SecretDetail.tsx"), "SecretDetail"),
    },
  ],
};
