import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useFunctions } from "./hooks/useFunctions.ts";
import { CreateFunction } from "./pages/CreateFunction.tsx";
import { FunctionDetail } from "./pages/FunctionDetail.tsx";
import { FunctionList } from "./pages/FunctionList.tsx";
import { LAMBDA_ROUTE_PATTERNS, LAMBDA_SERVICE_ID, lambdaRoutes } from "./routes.ts";

export const lambdaService: ServiceDefinition = {
  id: LAMBDA_SERVICE_ID,
  name: "Lambda",
  fullName: "AWS Lambda",
  description: "Functions: edit code, test with events, logs and S3/SQS triggers",
  iconPath: "/icons/lambda.svg",
  navigation: [{ text: "Functions", href: lambdaRoutes.functions }],
  quickLinks: [{ text: "Create function", href: lambdaRoutes.createFunction }],
  routes: [
    { index: true, element: <Navigate to={lambdaRoutes.functions} replace /> },
    { path: LAMBDA_ROUTE_PATTERNS.functions, element: <FunctionList /> },
    { path: LAMBDA_ROUTE_PATTERNS.createFunction, element: <CreateFunction /> },
    { path: LAMBDA_ROUTE_PATTERNS.function, element: <FunctionDetail /> },
  ],
  useResourceCount: () => ({ count: useFunctions().data?.length, noun: "function" }),
};
