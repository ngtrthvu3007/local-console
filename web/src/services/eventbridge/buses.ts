import {
  ListEventBusesCommand,
  type EventBus,
  type EventBridgeClient,
} from "@aws-sdk/client-eventbridge";
import { allPages } from "@shared/aws.ts";

export interface Bus {
  name: string;
  arn: string;
}

const toBus = (listed: EventBus): Bus => ({
  name: listed.Name ?? "",
  arn: listed.Arn ?? "",
});

export const listBuses = (client: EventBridgeClient) =>
  allPages(async (nextToken) => {
    const page = await client.send(new ListEventBusesCommand({ NextToken: nextToken }));
    return { items: (page.EventBuses ?? []).map(toBus), nextToken: page.NextToken };
  });
