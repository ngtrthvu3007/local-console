import { Navigate } from "react-router";
import { IconAdjustments } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { SSM_ROUTE_PATTERNS, SSM_SERVICE_ID, ssmRoutes } from "@localconsole/core/ssm";

export const ssmService: ServiceDefinition = {
  id: SSM_SERVICE_ID,
  name: "Systems Manager",
  fullName: "AWS Systems Manager",
  description: "Parameter Store: create, edit and read the parameters your apps load at run time",
  icon: IconAdjustments,
  category: "management",
  navigation: [{ text: "Parameter Store", href: ssmRoutes.parameters }],
  routes: [
    { index: true, element: <Navigate to={ssmRoutes.parameters} replace /> },
    {
      path: SSM_ROUTE_PATTERNS.parameters,
      ...lazyPage(() => import("./pages/ParameterList.tsx"), "ParameterList"),
    },
    {
      path: SSM_ROUTE_PATTERNS.createParameter,
      ...lazyPage(() => import("./pages/ParameterForm.tsx"), "ParameterForm"),
    },
    {
      path: SSM_ROUTE_PATTERNS.editParameter,
      ...lazyPage(() => import("./pages/ParameterForm.tsx"), "ParameterForm"),
    },
    {
      path: SSM_ROUTE_PATTERNS.parameter,
      ...lazyPage(() => import("./pages/ParameterDetail.tsx"), "ParameterDetail"),
    },
  ],
};
