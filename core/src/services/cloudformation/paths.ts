import { fillPath, withTab } from "#shared/utils/paths.ts";

export const CLOUDFORMATION_SERVICE_ID = "cloudformation";
const CLOUDFORMATION_ROOT = `/${CLOUDFORMATION_SERVICE_ID}`;

export const STACK_TABS = { events: "events", resources: "resources", outputs: "outputs" } as const;
export type StackTab = (typeof STACK_TABS)[keyof typeof STACK_TABS];

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
    fillPath(fullPath(CLOUDFORMATION_ROUTE_PATTERNS.editStack), { stack }),
  stack: (stack: string, tab?: StackTab) =>
    withTab(
      fillPath(fullPath(CLOUDFORMATION_ROUTE_PATTERNS.stack), { stack }),
      tab,
      STACK_TABS.events,
    ),
};
