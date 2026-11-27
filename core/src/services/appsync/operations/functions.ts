import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  UpdateFunctionCommand,
  paginateListFunctions,
  type AppSyncClient,
} from "@aws-sdk/client-appsync";
import { collectPages } from "#shared/aws/pagination.ts";
import { functionInput } from "#services/appsync/apis.ts";
import type { FunctionForm } from "#services/appsync/schemas.ts";

// functionId có = sửa
export interface SaveFunctionInput {
  functionId?: string;
  form: FunctionForm;
}

// Pipeline function của API (khác function Lambda)
export const listFunctions = (appsync: AppSyncClient, apiId: string) =>
  collectPages(paginateListFunctions({ client: appsync }, { apiId }), (page) => page.functions);

// Trả functionId để mở lại trang
export async function saveFunction(
  appsync: AppSyncClient,
  apiId: string,
  { functionId, form }: SaveFunctionInput,
) {
  const input = { apiId, ...functionInput(form) };
  const { functionConfiguration } = functionId
    ? await appsync.send(new UpdateFunctionCommand({ ...input, functionId }))
    : await appsync.send(new CreateFunctionCommand(input));
  return functionConfiguration?.functionId ?? "";
}

export const deleteFunction = (appsync: AppSyncClient, apiId: string, functionId: string) =>
  appsync.send(new DeleteFunctionCommand({ apiId, functionId }));
