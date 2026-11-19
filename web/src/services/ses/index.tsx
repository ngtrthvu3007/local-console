import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useMailbox } from "./hooks/useMailbox.ts";
import { Identities } from "./pages/Identities.tsx";
import { Mailbox } from "./pages/Mailbox.tsx";
import { Templates } from "./pages/Templates.tsx";
import { SES_ROUTE_PATTERNS, SES_SERVICE_ID, sesRoutes } from "./routes.ts";

export const sesService: ServiceDefinition = {
  id: SES_SERVICE_ID,
  name: "SES",
  fullName: "Amazon Simple Email Service",
  description: "Local mailbox for emails your app sends, sender identities and templates",
  iconPath: "/icons/ses.svg",
  navigation: [
    { text: "Mailbox", href: sesRoutes.mailbox },
    { text: "Identities", href: sesRoutes.identities },
    { text: "Templates", href: sesRoutes.templates },
  ],
  quickLinks: [{ text: "Identities", href: sesRoutes.identities }],
  routes: [
    { index: true, element: <Navigate to={sesRoutes.mailbox} replace /> },
    { path: SES_ROUTE_PATTERNS.mailbox, element: <Mailbox /> },
    { path: SES_ROUTE_PATTERNS.identities, element: <Identities /> },
    { path: SES_ROUTE_PATTERNS.templates, element: <Templates /> },
  ],
  useResourceCount: () => ({ count: useMailbox().data?.length, noun: "email" }),
};
