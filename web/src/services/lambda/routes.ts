import { generatePath } from "react-router";

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

export const SEARCH_PARAMS = { tab: "tab" } as const;

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
  function: (name: string, tab?: FunctionTab) => {
    const path = generatePath(fullPath(LAMBDA_ROUTE_PATTERNS.function), { name });
    return tab && tab !== FUNCTION_TABS.code
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const lambdaBaseCrumbs = [
  { text: "AWS Lambda", href: lambdaRoutes.functions },
  { text: "Functions", href: lambdaRoutes.functions },
];

export const functionCrumbs = (name: string) => [
  ...lambdaBaseCrumbs,
  { text: name, href: lambdaRoutes.function(name) },
];

// Rời trang có code chưa deploy thì hỏi lại, trừ điều hướng mang cờ này (vd: sau khi xóa function)
export const SKIP_LEAVE_GUARD = "skipLeaveGuard";
