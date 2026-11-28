import { Navigate } from "react-router";
import { IconTemplate } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  CLOUDFORMATION_ROUTE_PATTERNS,
  CLOUDFORMATION_SERVICE_ID,
  cloudformationRoutes,
} from "./routes.ts";

export const cloudformationService: ServiceDefinition = {
  id: CLOUDFORMATION_SERVICE_ID,
  name: "CloudFormation",
  fullName: "AWS CloudFormation",
  description: "Stacks that CDK or SAM deployed: events, resources, outputs, stubbed resources",
  icon: IconTemplate,
  category: "management",
  navigation: [{ text: "Stacks", href: cloudformationRoutes.stacks }],
  routes: [
    { index: true, element: <Navigate to={cloudformationRoutes.stacks} replace /> },
    {
      path: CLOUDFORMATION_ROUTE_PATTERNS.stacks,
      ...lazyPage(() => import("./pages/StackList.tsx"), "StackList"),
    },
    {
      path: CLOUDFORMATION_ROUTE_PATTERNS.createStack,
      ...lazyPage(() => import("./pages/StackTemplateForm.tsx"), "StackTemplateForm"),
    },
    {
      path: CLOUDFORMATION_ROUTE_PATTERNS.stack,
      ...lazyPage(() => import("./pages/StackDetail.tsx"), "StackDetail"),
    },
    {
      path: CLOUDFORMATION_ROUTE_PATTERNS.editStack,
      ...lazyPage(() => import("./pages/StackTemplateForm.tsx"), "StackTemplateForm"),
    },
  ],
};
