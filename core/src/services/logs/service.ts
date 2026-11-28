import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import {
  listLogEvents,
  logGroupExists,
  logStreamExists,
  readLogMessages,
  type LogEventsInput,
} from "./operations/events.ts";
import {
  createLogGroup,
  deleteLogGroup,
  deleteLogGroups,
  getLogGroup,
  listLogGroups,
  putRetention,
} from "./operations/logGroups.ts";
import {
  getStreamEventsPage,
  listLogStreams,
  readStreamFromHead,
  sendTestEvent,
} from "./operations/logStreams.ts";
import {
  deleteSubscriptionFilters,
  listSubscriptionFilters,
  putSubscriptionFilter,
  type NewSubscriptionFilter,
} from "./operations/subscriptionFilters.ts";

export function createLogsService(logs: CloudWatchLogsClient) {
  return {
    logGroupExists: (name: string) => logGroupExists(logs, name),
    logStreamExists: (group: string, stream: string) => logStreamExists(logs, group, stream),
    listLogEvents: (input: LogEventsInput) => listLogEvents(logs, input),
    readLogMessages: (input: { logGroupName: string; startTime: number; endTime: number }) =>
      readLogMessages(logs, input),
    listLogGroups: (prefix: string) => listLogGroups(logs, prefix),
    getLogGroup: (name: string) => getLogGroup(logs, name),
    createLogGroup: (input: { name: string; days?: number }) => createLogGroup(logs, input),
    deleteLogGroup: (name: string) => deleteLogGroup(logs, name),
    deleteLogGroups: (names: readonly string[]) => deleteLogGroups(logs, names),
    putRetention: (input: { name: string; days: number | undefined }) => putRetention(logs, input),
    listLogStreams: (group: string) => listLogStreams(logs, group),
    getStreamEventsPage: (input: { group: string; stream: string; token?: string }) =>
      getStreamEventsPage(logs, input),
    readStreamFromHead: (group: string, stream: string) => readStreamFromHead(logs, group, stream),
    sendTestEvent: (input: { group: string; stream: string; message: string }) =>
      sendTestEvent(logs, input),
    listSubscriptionFilters: (group: string) => listSubscriptionFilters(logs, group),
    putSubscriptionFilter: (group: string, filter: NewSubscriptionFilter) =>
      putSubscriptionFilter(logs, group, filter),
    deleteSubscriptionFilters: (group: string, names: readonly string[]) =>
      deleteSubscriptionFilters(logs, group, names),
  };
}

export type LogsService = ReturnType<typeof createLogsService>;
