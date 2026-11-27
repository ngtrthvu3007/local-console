import {
  DeleteFunctionEventInvokeConfigCommand,
  ListFunctionEventInvokeConfigsCommand,
  PutFunctionEventInvokeConfigCommand,
  type LambdaClient,
} from "@aws-sdk/client-lambda";
import { toInvokeParams, type AsyncInvocationInput } from "#services/lambda/asyncInvocation.ts";

// Đọc bằng List (không có thì mảng rỗng) vì Get trả 404 khi chưa cấu hình và console.error ồn
export async function getAsyncInvocation(lambda: LambdaClient, name: string) {
  const page = await lambda.send(new ListFunctionEventInvokeConfigsCommand({ FunctionName: name }));
  return page.FunctionEventInvokeConfigs?.[0] ?? null;
}

export const putAsyncInvocation = (
  lambda: LambdaClient,
  name: string,
  values: AsyncInvocationInput,
) =>
  lambda.send(
    new PutFunctionEventInvokeConfigCommand({ FunctionName: name, ...toInvokeParams(values) }),
  );

export const removeAsyncInvocation = (lambda: LambdaClient, name: string) =>
  lambda.send(new DeleteFunctionEventInvokeConfigCommand({ FunctionName: name }));
