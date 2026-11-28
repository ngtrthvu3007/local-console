import { fillPath, withTab } from "#shared/utils/paths.ts";

export const STEPFUNCTIONS_SERVICE_ID = "stepfunctions";
const STEPFUNCTIONS_ROOT = `/${STEPFUNCTIONS_SERVICE_ID}`;

export const STATE_MACHINE_TABS = { executions: "executions", definition: "definition" } as const;
export type StateMachineTab = (typeof STATE_MACHINE_TABS)[keyof typeof STATE_MACHINE_TABS];

// arn: execution đang xem (ARN có dấu ":" nên nằm trên query); step: bước đang mở ở panel
export const SEARCH_PARAMS = { arn: "arn", step: "step" } as const;

export const STEPFUNCTIONS_ROUTE_PATTERNS = {
  stateMachines: "statemachines",
  stateMachine: "statemachines/:name",
  execution: "execution",
} as const;

const fullPath = (pattern: string) => `${STEPFUNCTIONS_ROOT}/${pattern}`;

export const stepfunctionsRoutes = {
  stateMachines: fullPath(STEPFUNCTIONS_ROUTE_PATTERNS.stateMachines),
  stateMachine: (name: string, tab?: StateMachineTab) =>
    withTab(
      fillPath(fullPath(STEPFUNCTIONS_ROUTE_PATTERNS.stateMachine), { name }),
      tab,
      STATE_MACHINE_TABS.executions,
    ),
  execution: (arn: string) =>
    `${fullPath(STEPFUNCTIONS_ROUTE_PATTERNS.execution)}?${new URLSearchParams({ [SEARCH_PARAMS.arn]: arn })}`,
};
