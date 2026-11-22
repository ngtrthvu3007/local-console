import { generatePath } from "react-router";

export const STEPFUNCTIONS_SERVICE_ID = "stepfunctions";
const STEPFUNCTIONS_ROOT = `/${STEPFUNCTIONS_SERVICE_ID}`;

export const STATE_MACHINE_TABS = { executions: "executions", definition: "definition" } as const;
export type StateMachineTab = (typeof STATE_MACHINE_TABS)[keyof typeof STATE_MACHINE_TABS];

// arn: execution đang xem (ARN có dấu ":" nên nằm trên query); step: bước đang mở ở panel
export const SEARCH_PARAMS = { tab: "tab", arn: "arn", step: "step" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const STEPFUNCTIONS_ROUTE_PATTERNS = {
  stateMachines: "statemachines",
  stateMachine: "statemachines/:name",
  execution: "execution",
} as const;

const fullPath = (pattern: string) => `${STEPFUNCTIONS_ROOT}/${pattern}`;

export const stepfunctionsRoutes = {
  stateMachines: fullPath(STEPFUNCTIONS_ROUTE_PATTERNS.stateMachines),
  // Tab mặc định (Executions) không ghi lên URL
  stateMachine: (name: string, tab?: StateMachineTab) => {
    const path = generatePath(fullPath(STEPFUNCTIONS_ROUTE_PATTERNS.stateMachine), { name });
    return tab && tab !== STATE_MACHINE_TABS.executions
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
  execution: (arn: string) =>
    `${fullPath(STEPFUNCTIONS_ROUTE_PATTERNS.execution)}?${new URLSearchParams({ [SEARCH_PARAMS.arn]: arn })}`,
};

export const stateMachinesCrumbs = [
  { text: "AWS Step Functions", href: stepfunctionsRoutes.stateMachines },
  { text: "State machines", href: stepfunctionsRoutes.stateMachines },
];

export const stateMachineCrumbs = (name: string) => [
  ...stateMachinesCrumbs,
  { text: name, href: stepfunctionsRoutes.stateMachine(name) },
];
