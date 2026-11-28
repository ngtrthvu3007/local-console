import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  ListEventBusesCommand,
  PutEventsCommand,
  type EventBridgeClient,
} from "@aws-sdk/client-eventbridge";
import { allPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { toBus, type Bus } from "#services/eventbridge/buses.ts";
import { deleteRule, listRules } from "./rules.ts";

export interface PutEventInput {
  bus: string;
  source: string;
  detailType: string;
  detail: string;
}

export const listBuses = (events: EventBridgeClient) =>
  allPages(async (nextToken) => {
    const page = await events.send(new ListEventBusesCommand({ NextToken: nextToken }));
    return { items: (page.EventBuses ?? []).map(toBus), nextToken: page.NextToken };
  });

export const createBus = (events: EventBridgeClient, name: string) =>
  events.send(new CreateEventBusCommand({ Name: name }));

async function deleteBus(events: EventBridgeClient, bus: string) {
  // Rule nằm trong bus nên xóa cùng
  for (const rule of await listRules(events, bus)) await deleteRule(events, bus, rule.name);
  await events.send(new DeleteEventBusCommand({ Name: bus }));
}

export const deleteBuses = (events: EventBridgeClient, buses: readonly Bus[]) =>
  runEach(
    buses,
    (bus) => bus.name,
    (bus) => deleteBus(events, bus.name),
  );

export async function putEvent(
  events: EventBridgeClient,
  { bus, source, detailType, detail }: PutEventInput,
) {
  const result = await events.send(
    new PutEventsCommand({
      Entries: [{ EventBusName: bus, Source: source, DetailType: detailType, Detail: detail }],
    }),
  );

  const entry = result.Entries?.[0];
  // PutEvents báo lỗi từng entry ở đây chứ không ném
  if (result.FailedEntryCount) throw new Error(entry?.ErrorMessage ?? "Couldn't send the event");
  return entry?.EventId;
}
