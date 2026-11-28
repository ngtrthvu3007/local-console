import { Navigate } from "react-router";
import { IconRoute } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  STEPFUNCTIONS_ROUTE_PATTERNS,
  STEPFUNCTIONS_SERVICE_ID,
  stepfunctionsRoutes,
} from "@localconsole/core/stepfunctions";

export const stepfunctionsService: ServiceDefinition = {
  id: STEPFUNCTIONS_SERVICE_ID,
  name: "Step Functions",
  fullName: "AWS Step Functions",
  description: "State machines: start executions, follow each step, stop a stuck run",
  icon: IconRoute,
  category: "integration",
  navigation: [{ text: "State machines", href: stepfunctionsRoutes.stateMachines }],
  routes: [
    { index: true, element: <Navigate to={stepfunctionsRoutes.stateMachines} replace /> },
    {
      path: STEPFUNCTIONS_ROUTE_PATTERNS.stateMachines,
      ...lazyPage(() => import("./pages/StateMachineList.tsx"), "StateMachineList"),
    },
    {
      path: STEPFUNCTIONS_ROUTE_PATTERNS.stateMachine,
      ...lazyPage(() => import("./pages/StateMachineDetail.tsx"), "StateMachineDetail"),
    },
    {
      path: STEPFUNCTIONS_ROUTE_PATTERNS.execution,
      ...lazyPage(() => import("./pages/ExecutionDetail.tsx"), "ExecutionDetail"),
    },
  ],
};
