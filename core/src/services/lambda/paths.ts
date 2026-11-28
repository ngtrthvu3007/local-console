import { fillPath } from "#shared/utils/paths.ts";
import { withTab } from "#shared/utils/paths.ts";

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

export const LAMBDA_ROUTE_PATTERNS = {
  functions: "functions",
  createFunction: "functions/create",
  function: "functions/:name",
} as const;

const fullPath = (pattern: string) => `${LAMBDA_ROOT}/${pattern}`;

export const lambdaRoutes = {
  functions: fullPath(LAMBDA_ROUTE_PATTERNS.functions),
  createFunction: fullPath(LAMBDA_ROUTE_PATTERNS.createFunction),
  function: (name: string, tab?: FunctionTab) =>
    withTab(fillPath(fullPath(LAMBDA_ROUTE_PATTERNS.function), { name }), tab, FUNCTION_TABS.code),
};
