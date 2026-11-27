import { stepfunctionsRoutes } from "@localconsole/core/stepfunctions";

export const stateMachinesCrumbs = [
  { text: "AWS Step Functions", href: stepfunctionsRoutes.stateMachines },
  { text: "State machines", href: stepfunctionsRoutes.stateMachines },
];

export const stateMachineCrumbs = (name: string) => [
  ...stateMachinesCrumbs,
  { text: name, href: stepfunctionsRoutes.stateMachine(name) },
];
