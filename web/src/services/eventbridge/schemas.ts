import { z } from "zod";
import { jsonError, jsonObjectError } from "@shared/json.ts";
import {
  BUS_NAME_MAX_LENGTH,
  NAME_PATTERN,
  DEFAULT_BUS_NAME,
  NAME_MAX_LENGTH,
  FLEXIBLE_MODES,
  RATE_UNITS,
  RULE_TYPES,
  SCHEDULE_EXPRESSION_PATTERN,
  SCHEDULE_KINDS,
  type RuleType,
  type ScheduleKind,
} from "./constants.ts";
import { patternError } from "./pattern.ts";
import { timingErrors } from "./scheduleExpression.ts";
import { ADDABLE_TARGET_KINDS, SCHEDULE_TARGET_KINDS } from "./targets.ts";

// Tên bus, rule, schedule và schedule group chung một luật; chỉ khác nhãn và độ dài tối đa
const nameSchema = (label: string, maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label} name.`)
    .max(maxLength, `Must be at most ${maxLength} characters.`)
    .regex(
      NAME_PATTERN,
      "Use only letters, numbers, periods (.), hyphens (-) and underscores (_).",
    );

export const createBusSchema = z.object({
  name: nameSchema("an event bus", BUS_NAME_MAX_LENGTH).refine(
    (name) => name !== DEFAULT_BUS_NAME,
    `"${DEFAULT_BUS_NAME}" already exists.`,
  ),
});

export const sendEventsSchema = z.object({
  bus: z.string().min(1, "Choose an event bus."),
  source: z.string().trim().min(1, "Enter a source."),
  detailType: z.string().trim().min(1, "Enter a detail type."),
  detail: z
    .string()
    .trim()
    .min(1, "Enter the event detail.")
    .superRefine((text, context) => {
      const error = jsonObjectError(text);
      if (error) context.addIssue({ code: "custom", message: error });
    }),
});

const RULE_TYPE_IDS = Object.keys(RULE_TYPES) as [RuleType, ...RuleType[]];

export const ruleSchema = z
  .object({
    bus: z.string().min(1, "Choose an event bus."),
    name: nameSchema("a rule", NAME_MAX_LENGTH),
    description: z.string().trim(),
    type: z.enum(RULE_TYPE_IDS),
    eventPattern: z.string(),
    scheduleExpression: z.string().trim(),
    enabled: z.boolean(),
  })
  .superRefine((values, context) => {
    const addIssue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (values.type === "pattern") {
      const error = patternError(values.eventPattern);
      if (error) addIssue("eventPattern", error);
    } else if (values.bus !== DEFAULT_BUS_NAME) {
      // Luật của AWS: rule theo lịch chỉ có trên bus default
      addIssue("type", `Schedule rules only run on the ${DEFAULT_BUS_NAME} bus.`);
    } else if (!SCHEDULE_EXPRESSION_PATTERN.test(values.scheduleExpression)) {
      addIssue("scheduleExpression", "Enter rate(...) or cron(...).");
    }
  });

export type RuleForm = z.input<typeof ruleSchema>;

// fifoArns: queue FIFO cần message group ID (luật của SQS)
export const addTargetSchema = (fifoArns: ReadonlySet<string>) =>
  z
    .object({
      kind: z.enum(ADDABLE_TARGET_KINDS),
      arn: z.string().min(1, "Choose a resource."),
      groupId: z.string().trim(),
    })
    .superRefine((values, context) => {
      if (fifoArns.has(values.arn) && !values.groupId)
        context.addIssue({
          code: "custom",
          path: ["groupId"],
          message: "Enter a message group ID.",
        });
    });

export type AddTargetForm = z.input<ReturnType<typeof addTargetSchema>>;

const SCHEDULE_KIND_IDS = Object.keys(SCHEDULE_KINDS) as [ScheduleKind, ...ScheduleKind[]];
// "other": đích form không biểu diễn được (ECS, Kinesis…), khóa khi sửa
const SCHEDULE_TARGET_IDS = [...SCHEDULE_TARGET_KINDS, "other"] as const;
const FLEXIBLE_MODE_IDS = Object.values(FLEXIBLE_MODES) as [string, ...string[]];

const MAX_FLEXIBLE_MINUTES = 1440;
const JSON_INPUT_TARGET_KINDS: ReadonlySet<string> = new Set([
  "lambda",
  "eventbus",
  "stepfunctions",
]);

// fifoArns: queue FIFO cần message group ID (luật của SQS)
export const scheduleSchema = (fifoArns: ReadonlySet<string>) =>
  z
    .object({
      name: nameSchema("a schedule", NAME_MAX_LENGTH),
      group: z.string().min(1, "Choose a schedule group."),
      description: z.string().trim(),
      kind: z.enum(SCHEDULE_KIND_IDS),
      atTime: z.string(),
      rateValue: z.string().trim(),
      rateUnit: z.enum(RATE_UNITS),
      cron: z.string(),
      timezone: z.string().min(1, "Choose a time zone."),
      deleteAfter: z.boolean(),
      flexMode: z.enum(FLEXIBLE_MODE_IDS),
      flexMinutes: z.string().trim(),
      targetKind: z.enum(SCHEDULE_TARGET_IDS),
      targetArn: z.string(),
      groupId: z.string().trim(),
      source: z.string().trim(),
      detailType: z.string().trim(),
      input: z.string(),
      enabled: z.boolean(),
    })
    .superRefine((values, context) => {
      const addIssue = (path: string, message: string) =>
        context.addIssue({ code: "custom", path: [path], message });

      for (const [path, message] of Object.entries(timingErrors(values))) addIssue(path, message);

      if (values.flexMode === FLEXIBLE_MODES.flexible) {
        const minutes = Number(values.flexMinutes);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_FLEXIBLE_MINUTES)
          addIssue("flexMinutes", `Enter a whole number from 1 to ${MAX_FLEXIBLE_MINUTES}.`);
      }

      if (values.targetKind === "other") return;
      if (!values.targetArn) addIssue("targetArn", "Choose a resource.");
      if (fifoArns.has(values.targetArn) && !values.groupId)
        addIssue("groupId", "Enter a message group ID.");
      if (values.targetKind === "eventbus") {
        if (!values.source) addIssue("source", "Enter a source.");
        if (!values.detailType) addIssue("detailType", "Enter a detail type.");
      }
      // Luật của Floci: Lambda, event bus và state machine nhận Input là JSON; SQS, SNS nhận text bất kỳ
      if (JSON_INPUT_TARGET_KINDS.has(values.targetKind)) {
        const error = jsonError(values.input);
        if (error) addIssue("input", error);
      }
    });

export type ScheduleForm = z.input<ReturnType<typeof scheduleSchema>>;

export const createGroupSchema = z.object({ name: nameSchema("a group", NAME_MAX_LENGTH) });
