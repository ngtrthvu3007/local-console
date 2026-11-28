import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const LAMBDA_SERVICE_ID = "lambda";
const LAMBDA_ROOT = `/${LAMBDA_SERVICE_ID}`;

export const FUNCTION_TABS = {
  code: "code",
  test: "test",
  monitor: "monitor",
  configuration: "configuration",
  triggers: "triggers",
} as const;
export type FunctionTab = (typeof FUNCTION_TABS)[keyof typeof FUNCTION_TABS];

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const LAMBDA_ROUTE_PATTERNS = {
  functions: "functions",
  createFunction: "functions/create",
  function: "functions/:name",
} as const;

const fullPath = (pattern: string) => `${LAMBDA_ROOT}/${pattern}`;

export const lambdaRoutes = {
  functions: fullPath(LAMBDA_ROUTE_PATTERNS.functions),
  createFunction: fullPath(LAMBDA_ROUTE_PATTERNS.createFunction),
  // Tab mặc định (Code) không ghi lên URL
  function: (name: string, tab?: FunctionTab) =>
    withTab(
      generatePath(fullPath(LAMBDA_ROUTE_PATTERNS.function), { name }),
      tab,
      FUNCTION_TABS.code,
    ),
};

export const lambdaBaseCrumbs = [
  { text: "AWS Lambda", href: lambdaRoutes.functions },
  { text: "Functions", href: lambdaRoutes.functions },
];

export const functionCrumbs = (name: string) => [
  ...lambdaBaseCrumbs,
  { text: name, href: lambdaRoutes.function(name) },
];
