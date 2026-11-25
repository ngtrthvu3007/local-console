import type { HistoryEvent } from "@aws-sdk/client-sfn";
import { z } from "zod";
import { lastArnPart } from "@shared/arn.ts";
import { functionNameOfArn } from "../lambda/helpers.ts";
import { queueNameOfUrl } from "../sqs/queues.ts";

type LinkedKind = "lambda" | "sqs" | "dynamodb" | "sns" | "statemachine";

export type TaskResource = { kind: LinkedKind; name: string } | { kind: "other"; text: string };

const LAMBDA_ARN_MARKER = ":function:";

// Tên resource nằm ở tham số đã resolve của bước; mỗi loại một tham số (spec 3.5)
const TARGET_OF_RESOURCE_TYPE: Record<
  string,
  { kind: LinkedKind; key: string; read: (value: string) => string }
> = {
  lambda: {
    kind: "lambda",
    key: "FunctionName",
    // FunctionName là tên hoặc ARN
    read: (value) => (value.includes(LAMBDA_ARN_MARKER) ? functionNameOfArn(value) : value),
  },
  sqs: { kind: "sqs", key: "QueueUrl", read: queueNameOfUrl },
  dynamodb: { kind: "dynamodb", key: "TableName", read: (value) => value },
  sns: { kind: "sns", key: "TopicArn", read: lastArnPart },
  states: { kind: "statemachine", key: "StateMachineArn", read: lastArnPart },
};

const parametersSchema = z.record(z.string(), z.unknown()).catch({});

function parseParameters(text?: string) {
  try {
    return parametersSchema.parse(JSON.parse(text ?? ""));
  } catch {
    return {};
  }
}

// Resource của bước Task, lấy từ event TaskScheduled hoặc LambdaFunctionScheduled
export function taskResourceOf(event: HistoryEvent): TaskResource | undefined {
  const lambda = event.lambdaFunctionScheduledEventDetails;
  if (lambda?.resource) return { kind: "lambda", name: functionNameOfArn(lambda.resource) };

  const task = event.taskScheduledEventDetails;
  if (!task) return undefined;
  const target = TARGET_OF_RESOURCE_TYPE[task.resourceType ?? ""];
  const value = target ? parseParameters(task.parameters)[target.key] : undefined;

  if (target && typeof value === "string" && value) {
    return { kind: target.kind, name: target.read(value) };
  }

  return { kind: "other", text: `${task.resourceType}:${task.resource}` };
}
