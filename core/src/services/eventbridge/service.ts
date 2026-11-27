import type { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";
import type { Bus } from "./buses.ts";
import type { Rule } from "./rules.ts";
import type { ScheduleRow } from "./schedules.ts";
import {
  createBus,
  deleteBuses,
  listBuses,
  putEvent,
  type PutEventInput,
} from "./operations/buses.ts";
import {
  listEventSources,
  listRuleTargets,
  listS3EventRules,
  listScheduleTargets,
} from "./operations/eventSources.ts";
import {
  addTarget,
  deleteRules,
  getRule,
  listRuleRows,
  listTargets,
  putRule,
  removeTargets,
  setRulesEnabled,
  testPattern,
  type AddTargetInput,
  type PatternTestInput,
  type PutRuleInput,
} from "./operations/rules.ts";
import {
  createScheduleGroup,
  deleteScheduleGroup,
  deleteSchedules,
  getSchedule,
  listScheduleGroups,
  listSchedules,
  saveSchedule,
  setSchedulesEnabled,
  type SaveScheduleInput,
} from "./operations/schedules.ts";

interface EventBridgeDeps {
  scheduler: SchedulerClient;
}

export function createEventBridgeService(
  events: EventBridgeClient,
  { scheduler }: EventBridgeDeps,
) {
  return {
    listBuses: () => listBuses(events),
    createBus: (name: string) => createBus(events, name),
    deleteBuses: (buses: readonly Bus[]) => deleteBuses(events, buses),
    putEvent: (input: PutEventInput) => putEvent(events, input),

    listRuleRows: (bus: string) => listRuleRows(events, bus),
    getRule: (bus: string, name: string) => getRule(events, bus, name),
    putRule: (input: PutRuleInput, existing?: Rule) => putRule(events, input, existing),
    setRulesEnabled: (rules: readonly Rule[], enabled: boolean) =>
      setRulesEnabled(events, rules, enabled),
    deleteRules: (rules: readonly Rule[]) => deleteRules(events, rules),
    testPattern: (input: PatternTestInput) => testPattern(events, input),
    listTargets: (bus: string, rule: string) => listTargets(events, bus, rule),
    addTarget: (bus: string, rule: string, input: AddTargetInput) =>
      addTarget(events, bus, rule, input),
    removeTargets: (bus: string, rule: string, ids: readonly string[]) =>
      removeTargets(events, bus, rule, ids),

    listSchedules: (group?: string) => listSchedules(scheduler, group),
    listScheduleGroups: () => listScheduleGroups(scheduler),
    getSchedule: (group: string, name: string) => getSchedule(scheduler, group, name),
    createScheduleGroup: (name: string) => createScheduleGroup(scheduler, name),
    deleteScheduleGroup: (name: string) => deleteScheduleGroup(scheduler, name),
    saveSchedule: (input: SaveScheduleInput, editing: boolean) =>
      saveSchedule(scheduler, input, editing),
    setSchedulesEnabled: (rows: readonly ScheduleRow[], enabled: boolean) =>
      setSchedulesEnabled(scheduler, rows, enabled),
    deleteSchedules: (rows: readonly ScheduleRow[]) => deleteSchedules(scheduler, rows),

    listRuleTargets: () => listRuleTargets(events),
    listScheduleTargets: () => listScheduleTargets(scheduler),
    listEventSources: (matches: (targetArn: string) => boolean) =>
      listEventSources(events, scheduler, matches),
    listS3EventRules: (bucket: string) => listS3EventRules(events, bucket),
  };
}

export type EventBridgeService = ReturnType<typeof createEventBridgeService>;
