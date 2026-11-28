import { lambdaRoutes } from "@localconsole/core/lambda";

export const lambdaBaseCrumbs = [
  { text: "AWS Lambda", href: lambdaRoutes.functions },
  { text: "Functions", href: lambdaRoutes.functions },
];

export const functionCrumbs = (name: string) => [
  ...lambdaBaseCrumbs,
  { text: name, href: lambdaRoutes.function(name) },
];
