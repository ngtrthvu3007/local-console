import { cloudformationRoutes } from "@localconsole/core/cloudformation";

export const stacksCrumbs = [
  { text: "AWS CloudFormation", href: cloudformationRoutes.stacks },
  { text: "Stacks", href: cloudformationRoutes.stacks },
];

export const stackCrumbs = (stack: string) => [
  ...stacksCrumbs,
  { text: stack, href: cloudformationRoutes.stack(stack) },
];
