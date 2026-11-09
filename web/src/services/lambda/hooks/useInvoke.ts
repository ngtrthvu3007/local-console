import { useMutation } from "@tanstack/react-query";
import {
  paginateFilterLogEvents,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { orEmptyWhenNotFound } from "@shared/aws.ts";
import { reformatJson } from "@shared/json.ts";
import { logMessageText } from "../helpers.ts";
import { INVOCATION_TYPES, LOG_CLOCK_SKEW_MS, type InvocationType } from "../constants.ts";
import { useLambda } from "./useLambda.ts";

type InvokeStatus = "succeeded" | "failed" | "accepted";

export interface InvokeResult {
  status: InvokeStatus;
  durationMs: number; // đo ở trình duyệt: Floci không trả Billed duration
  requestId?: string;
  response?: string;
  logs?: string;
}

interface InvokeInput {
  payload: string;
  invocationType: InvocationType;
}

// Floci không trả LogResult và không ghi dòng REPORT có request ID,
// nên lấy log theo khoảng thời gian của lần chạy (trigger chạy cùng lúc thì log có thể lẫn vào)
async function readLogsBetween(
  logs: CloudWatchLogsClient,
  logGroupName: string,
  startTime: number,
  endTime: number,
) {
  const messages: string[] = [];
  const paginator = paginateFilterLogEvents({ client: logs }, { logGroupName, startTime, endTime });
  for await (const page of paginator) {
    messages.push(...(page.events ?? []).map((event) => logMessageText(event.message)));
  }
  return messages.join("\n");
}

export function useInvoke(functionName: string, logGroupName: string) {
  const { lambda, logs } = useLambda();
  return useMutation({
    mutationFn: async ({ payload, invocationType }: InvokeInput): Promise<InvokeResult> => {
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

      const functionLogs = await orEmptyWhenNotFound(
        () =>
          readLogsBetween(
            logs,
            logGroupName,
            startedAt - LOG_CLOCK_SKEW_MS,
            finishedAt + LOG_CLOCK_SKEW_MS,
          ),
        "",
      );
      return {
        ...common,
        status: result.FunctionError ? "failed" : "succeeded",
        response: reformatJson(result.Payload?.transformToString() ?? ""),
        logs: functionLogs,
      };
    },
  });
}
