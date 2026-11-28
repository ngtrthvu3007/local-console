import { InvokeCommand, type LambdaClient } from "@aws-sdk/client-lambda";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import { reformatJson } from "#shared/utils/json.ts";
import type { LogsService } from "#services/logs/service.ts";
import {
  INVOCATION_TYPES,
  LOG_CLOCK_SKEW_MS,
  type InvocationType,
} from "#services/lambda/constants.ts";

type InvokeStatus = "succeeded" | "failed" | "accepted";

export interface InvokeResult {
  status: InvokeStatus;
  durationMs: number; // đo ở nơi gọi: Floci không trả Billed duration
  requestId?: string;
  response?: string;
  logs?: string;
}

export interface InvokeInput {
  functionName: string;
  logGroupName: string;
  payload: string;
  invocationType: InvocationType;
}

export async function invoke(
  lambda: LambdaClient,
  logs: Pick<LogsService, "readLogMessages">,
  { functionName, logGroupName, payload, invocationType }: InvokeInput,
): Promise<InvokeResult> {
  const startedAt = Date.now();

  const result = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: invocationType,
      Payload: new TextEncoder().encode(payload),
    }),
  );

  const finishedAt = Date.now();
  const common = { durationMs: finishedAt - startedAt, requestId: result.$metadata.requestId };
  if (invocationType === INVOCATION_TYPES.async) return { ...common, status: "accepted" };

  // Floci không trả LogResult / request ID nên lấy log theo khoảng thời gian chạy (có thể lẫn log trigger)
  const functionLogs = await orEmptyWhenNotFound(
    () =>
      logs.readLogMessages({
        logGroupName,
        startTime: startedAt - LOG_CLOCK_SKEW_MS,
        endTime: finishedAt + LOG_CLOCK_SKEW_MS,
      }),
    "",
  );

  return {
    ...common,
    status: result.FunctionError ? "failed" : "succeeded",
    response: reformatJson(result.Payload?.transformToString() ?? ""),
    logs: functionLogs,
  };
}
