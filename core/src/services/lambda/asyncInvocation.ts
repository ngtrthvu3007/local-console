import type {
  DestinationConfig,
  PutFunctionEventInvokeConfigCommandInput,
} from "@aws-sdk/client-lambda";
import type { z } from "zod";
import type { asyncInvocationSchema } from "./schemas.ts";

export type AsyncInvocationInput = z.output<typeof asyncInvocationSchema>;

// Put ghi đè cả cấu hình, nên đích "None" là bỏ hẳn khóa đó
export function toInvokeParams(
  values: AsyncInvocationInput,
): Omit<PutFunctionEventInvokeConfigCommandInput, "FunctionName"> {
  const destination: DestinationConfig = {};
  if (values.onSuccessKind !== "none") destination.OnSuccess = { Destination: values.onSuccessArn };
  if (values.onFailureKind !== "none") destination.OnFailure = { Destination: values.onFailureArn };
  return {
    MaximumRetryAttempts: values.retryAttempts,
    MaximumEventAgeInSeconds: values.maxEventAge,
    DestinationConfig: destination,
  };
}
