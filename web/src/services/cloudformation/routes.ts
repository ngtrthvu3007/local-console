import { generatePath } from "react-router";

export const CLOUDFORMATION_SERVICE_ID = "cloudformation";
const CLOUDFORMATION_ROOT = `/${CLOUDFORMATION_SERVICE_ID}`;

export const STACK_TABS = { events: "events", resources: "resources", outputs: "outputs" } as const;
export type StackTab = (typeof STACK_TABS)[keyof typeof STACK_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

// Pattern tương đối cho router; link dựng từ đây
export const CLOUDFORMATION_ROUTE_PATTERNS = {
  stacks: "stacks",
  stack: "stacks/:stack",
} as const;

const fullPath = (pattern: string) => `${CLOUDFORMATION_ROOT}/${pattern}`;

export const cloudformationRoutes = {
  stacks: fullPath(CLOUDFORMATION_ROUTE_PATTERNS.stacks),
  // Tab mặc định (Events) không ghi lên URL
  stack: (stack: string, tab?: StackTab) => {
    const path = generatePath(fullPath(CLOUDFORMATION_ROUTE_PATTERNS.stack), { stack });
    return tab && tab !== STACK_TABS.events
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const stacksCrumbs = [
  { text: "AWS CloudFormation", href: cloudformationRoutes.stacks },
  { text: "Stacks", href: cloudformationRoutes.stacks },
];

export const stackCrumbs = (stack: string) => [
  ...stacksCrumbs,
  { text: stack, href: cloudformationRoutes.stack(stack) },
];
