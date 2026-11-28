import { Navigate } from "react-router";
import { IconLambda } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { LAMBDA_ROUTE_PATTERNS, LAMBDA_SERVICE_ID, lambdaRoutes } from "@localconsole/core/lambda";

export const lambdaService: ServiceDefinition = {
  id: LAMBDA_SERVICE_ID,
  name: "Lambda",
  fullName: "AWS Lambda",
  description: "Functions: edit code, test with events, logs and S3/SQS triggers",
  icon: IconLambda,
  category: "compute",
  navigation: [{ text: "Functions", href: lambdaRoutes.functions }],
  routes: [
    { index: true, element: <Navigate to={lambdaRoutes.functions} replace /> },
    {
      path: LAMBDA_ROUTE_PATTERNS.functions,
      ...lazyPage(() => import("./pages/FunctionList.tsx"), "FunctionList"),
    },
    {
      path: LAMBDA_ROUTE_PATTERNS.createFunction,
      ...lazyPage(() => import("./pages/CreateFunction.tsx"), "CreateFunction"),
    },
    {
      path: LAMBDA_ROUTE_PATTERNS.function,
      ...lazyPage(() => import("./pages/FunctionDetail.tsx"), "FunctionDetail"),
    },
  ],
};
