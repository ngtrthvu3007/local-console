import {
  CreateApiKeyCommand,
  DeleteApiKeyCommand,
  paginateListApiKeys,
  type AppSyncClient,
} from "@aws-sdk/client-appsync";
import { collectPages } from "#shared/aws/pagination.ts";
import { apiKeyExpires } from "#services/appsync/apis.ts";

export interface NewApiKey {
  description: string;
  days: number;
}

export const listApiKeys = (appsync: AppSyncClient, apiId: string) =>
  collectPages(paginateListApiKeys({ client: appsync }, { apiId }), (page) => page.apiKeys);

export const createApiKey = async (
  appsync: AppSyncClient,
  apiId: string,
  { description, days }: NewApiKey,
) =>
  (
    await appsync.send(
      new CreateApiKeyCommand({
        apiId,
        description: description || undefined,
        expires: apiKeyExpires(days, Date.now()),
      }),
    )
  ).apiKey?.id ?? "";

export const deleteApiKey = (appsync: AppSyncClient, apiId: string, id: string) =>
  appsync.send(new DeleteApiKeyCommand({ apiId, id }));
