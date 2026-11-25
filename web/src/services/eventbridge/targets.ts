import { ARN_SEPARATOR, lastArnPart } from "@shared/arn.ts";

const ARN_SERVICE_INDEX = 2;
const MAX_TARGET_ID_LENGTH = 64;

export const TARGET_KINDS = {
  lambda: "Lambda",
  sqs: "SQS",
  sns: "SNS",
  eventbus: "Event bus",
  stepfunctions: "Step Functions",
  kinesis: "Kinesis",
  other: "Other",
} as const;
type TargetKind = keyof typeof TARGET_KINDS;
// Loại target thêm được từ console. Event bus để nối bus này sang bus khác.
// Không có Kinesis: Floci 2.4.0 nhận target nhưng không giao event vào stream (spec Kinesis 7 #16)
export const ADDABLE_TARGET_KINDS = ["lambda", "sqs", "sns", "eventbus", "stepfunctions"] as const;
export type AddableTargetKind = (typeof ADDABLE_TARGET_KINDS)[number];

// Đích của schedule
export const SCHEDULE_TARGET_KINDS = ["lambda", "sqs", "sns", "eventbus", "stepfunctions"] as const;
export type ScheduleTargetKind = (typeof SCHEDULE_TARGET_KINDS)[number];

// Phần dịch vụ của ARN → loại target
const KIND_BY_ARN_SERVICE: Record<string, TargetKind> = {
  lambda: "lambda",
  sqs: "sqs",
  sns: "sns",
  events: "eventbus",
  states: "stepfunctions",
  kinesis: "kinesis",
};

export const targetKindOfArn = (arn: string): TargetKind =>
  KIND_BY_ARN_SERVICE[arn.split(ARN_SEPARATOR)[ARN_SERVICE_INDEX] ?? ""] ?? "other";

// "arn:aws:lambda:r:0:function:fn:prod" → "prod"; function không kèm version / alias thì undefined
const FUNCTION_QUALIFIER_INDEX = 7;
export const qualifierOfArn = (arn: string) => arn.split(ARN_SEPARATOR)[FUNCTION_QUALIFIER_INDEX];

// "arn:aws:events:r:0:event-bus/orders" → "orders"
const BUS_ARN_MARKER = "event-bus/";
export const busNameOfArn = (arn: string) => arn.split(BUS_ARN_MARKER).pop() ?? arn;

// Tên resource là phần cuối của ARN (function, queue, topic, state machine)
export const resourceNameOfArn = lastArnPart;

// Id target tự sinh từ loại và tên resource; luật của AWS: 1–64 ký tự
// Tên bus nằm sau "event-bus/" (có dấu /, id target không cho phép), nên lấy riêng
export const targetId = (kind: TargetKind, arn: string) =>
  `${kind}-${kind === "eventbus" ? busNameOfArn(arn) : resourceNameOfArn(arn)}`.slice(
    0,
    MAX_TARGET_ID_LENGTH,
  );
