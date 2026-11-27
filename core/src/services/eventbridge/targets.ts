import { ARN_SEPARATOR, lastArnPart } from "#shared/utils/arn.ts";
import { clusterNameOf } from "#services/ecs/arns.ts";
import { LAUNCH_TYPE } from "#services/ecs/constants.ts";

const ARN_SERVICE_INDEX = 2;
const MAX_TARGET_ID_LENGTH = 64;

export const TARGET_KINDS = {
  lambda: "Lambda",
  sqs: "SQS",
  sns: "SNS",
  eventbus: "Event bus",
  stepfunctions: "Step Functions",
  kinesis: "Kinesis",
  ecs: "ECS task",
  other: "Other",
} as const;
type TargetKind = keyof typeof TARGET_KINDS;
// Loại target chọn được từ console, cho cả rule lẫn schedule. Event bus để nối sang bus khác
// Không có Kinesis: Floci 2.4.0 nhận target nhưng không giao event vào stream (spec Kinesis 7 #16)
export const ADDABLE_TARGET_KINDS = [
  "lambda",
  "sqs",
  "sns",
  "eventbus",
  "stepfunctions",
  "ecs",
] as const;
export type AddableTargetKind = (typeof ADDABLE_TARGET_KINDS)[number];

// Phần dịch vụ của ARN → loại target
const KIND_BY_ARN_SERVICE: Record<string, TargetKind> = {
  lambda: "lambda",
  sqs: "sqs",
  sns: "sns",
  events: "eventbus",
  states: "stepfunctions",
  kinesis: "kinesis",
  ecs: "ecs",
};

export const targetKindOfArn = (arn: string): TargetKind =>
  KIND_BY_ARN_SERVICE[arn.split(ARN_SEPARATOR)[ARN_SERVICE_INDEX] ?? ""] ?? "other";

// "arn:aws:lambda:r:0:function:fn:prod" → "prod"; function không kèm version / alias thì undefined
const FUNCTION_QUALIFIER_INDEX = 7;
export const qualifierOfArn = (arn: string) => arn.split(ARN_SEPARATOR)[FUNCTION_QUALIFIER_INDEX];

// "arn:aws:events:r:0:event-bus/orders" → "orders"
const BUS_ARN_MARKER = "event-bus/";
export const busNameOfArn = (arn: string) => arn.split(BUS_ARN_MARKER).pop() ?? arn;

// Id target tự sinh từ loại và tên resource; luật của AWS: 1–64 ký tự
// Tên bus ("event-bus/<tên>") và cluster ("cluster/<tên>") chứa dấu /, id target không cho phép
const resourceNameOf = (kind: TargetKind, arn: string) => {
  if (kind === "eventbus") return busNameOfArn(arn);
  if (kind === "ecs") return clusterNameOf(arn);
  return lastArnPart(arn);
};

// qualifier: phân biệt nhiều target cùng resource (ECS: family task definition trên cùng cluster)
export const targetId = (kind: TargetKind, arn: string, qualifier?: string) =>
  [kind, resourceNameOf(kind, arn), qualifier]
    .filter(Boolean)
    .join("-")
    .slice(0, MAX_TARGET_ID_LENGTH);

export interface EcsTarget {
  taskDefinitionArn: string;
  subnets: string[];
  securityGroups: string[];
}

// Cùng một dạng cho SDK EventBridge và Scheduler: key "awsvpcConfiguration" viết thường, "Subnets" viết hoa.
// Thiếu network config thì Floci chỉ ghi lỗi vào log của nó (spec ECS 7 #5)
export const ecsParameters = (target: EcsTarget) => ({
  TaskDefinitionArn: target.taskDefinitionArn,
  LaunchType: LAUNCH_TYPE,
  TaskCount: 1,
  NetworkConfiguration: {
    awsvpcConfiguration: {
      Subnets: target.subnets,
      SecurityGroups: target.securityGroups.length ? target.securityGroups : undefined,
    },
  },
});
