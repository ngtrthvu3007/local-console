import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const CLOUDFORMATION_SERVICE_ID = "cloudformation";
const CLOUDFORMATION_ROOT = `/${CLOUDFORMATION_SERVICE_ID}`;

export const STACK_TABS = { events: "events", resources: "resources", outputs: "outputs" } as const;
export type StackTab = (typeof STACK_TABS)[keyof typeof STACK_TABS];

// Pattern tương đối cho router; link dựng từ đây
export const CLOUDFORMATION_ROUTE_PATTERNS = {
  stacks: "stacks",
  // Hai đoạn sau stacks/ để không trùng trang chi tiết của stack tên "create"; vẫn dưới stacks/
  // nên sidebar còn chọn CloudFormation (giống AWS console)
  createStack: "stacks/create/template",
  stack: "stacks/:stack",
  editStack: "stacks/:stack/edit",
} as const;

const fullPath = (pattern: string) => `${CLOUDFORMATION_ROOT}/${pattern}`;

export const cloudformationRoutes = {
  stacks: fullPath(CLOUDFORMATION_ROUTE_PATTERNS.stacks),
  createStack: fullPath(CLOUDFORMATION_ROUTE_PATTERNS.createStack),
  editStack: (stack: string) =>
    generatePath(fullPath(CLOUDFORMATION_ROUTE_PATTERNS.editStack), { stack }),
  // Tab mặc định (Events) không ghi lên URL
  stack: (stack: string, tab?: StackTab) =>
    withTab(
      generatePath(fullPath(CLOUDFORMATION_ROUTE_PATTERNS.stack), { stack }),
      tab,
      STACK_TABS.events,
    ),
};

export const stacksCrumbs = [
  { text: "AWS CloudFormation", href: cloudformationRoutes.stacks },
  { text: "Stacks", href: cloudformationRoutes.stacks },
];

export const stackCrumbs = (stack: string) => [
  ...stacksCrumbs,
  { text: stack, href: cloudformationRoutes.stack(stack) },
];
