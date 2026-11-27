import type { FunctionEventInvokeConfig } from "@aws-sdk/client-lambda";
import { targetKindOfArn } from "@localconsole/core/eventbridge";
import {
  ASYNC_EVENT_AGE_SECONDS,
  ASYNC_RETRY_ATTEMPTS,
  type DestinationKind,
} from "@localconsole/core/lambda";

export interface AsyncInvocationValues {
  retryAttempts: string;
  maxEventAge: string;
  onSuccessKind: DestinationKind;
  onSuccessArn: string;
  onFailureKind: DestinationKind;
  onFailureArn: string;
}

// Mặc định của AWS khi function chưa có cấu hình
export const DEFAULT_ASYNC_INVOCATION: AsyncInvocationValues = {
  retryAttempts: String(ASYNC_RETRY_ATTEMPTS.default),
  maxEventAge: String(ASYNC_EVENT_AGE_SECONDS.default),
  onSuccessKind: "none",
  onSuccessArn: "",
  onFailureKind: "none",
  onFailureArn: "",
};

// ARN đích → loại trong form; loại Console chưa hỗ trợ (Step Functions…) coi như không có
export function destinationKindOf(arn?: string): DestinationKind {
  const kind = arn ? targetKindOfArn(arn) : "none";
  return kind === "sqs" || kind === "sns" || kind === "lambda" || kind === "eventbus"
    ? kind
    : "none";
}

export const fromInvokeConfig = (config?: FunctionEventInvokeConfig): AsyncInvocationValues =>
  !config
    ? DEFAULT_ASYNC_INVOCATION
    : {
        retryAttempts: String(config.MaximumRetryAttempts ?? ASYNC_RETRY_ATTEMPTS.default),
        maxEventAge: String(config.MaximumEventAgeInSeconds ?? ASYNC_EVENT_AGE_SECONDS.default),
        onSuccessKind: destinationKindOf(config.DestinationConfig?.OnSuccess?.Destination),
        onSuccessArn: config.DestinationConfig?.OnSuccess?.Destination ?? "",
        onFailureKind: destinationKindOf(config.DestinationConfig?.OnFailure?.Destination),
        onFailureArn: config.DestinationConfig?.OnFailure?.Destination ?? "",
      };
