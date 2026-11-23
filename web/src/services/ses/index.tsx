import { Navigate } from "react-router";
import { IconMail } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { SES_ROUTE_PATTERNS, SES_SERVICE_ID, sesRoutes } from "./routes.ts";

export const sesService: ServiceDefinition = {
  id: SES_SERVICE_ID,
  name: "SES",
  fullName: "Amazon Simple Email Service",
  description: "Local mailbox for emails your app sends, sender identities and templates",
  icon: IconMail,
  category: "business",
  navigation: [
    { text: "Mailbox", href: sesRoutes.mailbox },
    { text: "Identities", href: sesRoutes.identities },
    { text: "Templates", href: sesRoutes.templates },
    { text: "Configuration sets", href: sesRoutes.configurationSets },
  ],
  routes: [
    { index: true, element: <Navigate to={sesRoutes.mailbox} replace /> },
    {
      path: SES_ROUTE_PATTERNS.mailbox,
      ...lazyPage(() => import("./pages/Mailbox.tsx"), "Mailbox"),
    },
    {
      path: SES_ROUTE_PATTERNS.identities,
      ...lazyPage(() => import("./pages/Identities.tsx"), "Identities"),
    },
    {
      path: SES_ROUTE_PATTERNS.templates,
      ...lazyPage(() => import("./pages/Templates.tsx"), "Templates"),
    },
    {
      path: SES_ROUTE_PATTERNS.configurationSets,
      ...lazyPage(() => import("./pages/ConfigurationSets.tsx"), "ConfigurationSets"),
    },
  ],
};
