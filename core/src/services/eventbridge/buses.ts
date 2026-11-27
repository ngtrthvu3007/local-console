import type { EventBus } from "@aws-sdk/client-eventbridge";

export interface Bus {
  name: string;
  arn: string;
}

export const toBus = (listed: EventBus): Bus => ({
  name: listed.Name ?? "",
  arn: listed.Arn ?? "",
});
