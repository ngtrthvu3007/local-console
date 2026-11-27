import {
  CreateApiKeyCommand,
  CreateGraphqlApiCommand,
  DeleteGraphqlApiCommand,
  GetGraphqlApiCommand,
  UpdateGraphqlApiCommand,
  paginateListGraphqlApis,
  type AppSyncClient,
  type UpdateGraphqlApiRequest,
} from "@aws-sdk/client-appsync";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import { collectPages } from "#shared/aws/pagination.ts";
import { errorMessage } from "#shared/utils/errorMessage.ts";
import { apiKeyExpires } from "#services/appsync/apis.ts";
import { API_KEY_DAYS, AUTH_TYPES, COGNITO_DEFAULT_ACTION } from "#services/appsync/constants.ts";
import { STARTER_SCHEMA } from "#services/appsync/resolverTemplates.ts";
import type { CreateApiForm } from "#services/appsync/schemas.ts";
import { saveSchema } from "./schema.ts";

export const listApis = (appsync: AppSyncClient) =>
  collectPages(paginateListGraphqlApis({ client: appsync }, {}), (page) => page.graphqlApis);

// null = không có API
export const getApi = (appsync: AppSyncClient, apiId: string) =>
  orEmptyWhenNotFound(
    async () => (await appsync.send(new GetGraphqlApiCommand({ apiId }))).graphqlApi ?? null,
    null,
  );

// API mới có luôn schema mẫu: GetIntrospectionSchema của API chưa có schema trả 404 (spec 7 #17).
// Auth API key thì tạo luôn một key như AWS console
export async function createApi(
  appsync: AppSyncClient,
  region: string,
  { name, authType, userPoolId }: CreateApiForm,
) {
  const { graphqlApi } = await appsync.send(
    new CreateGraphqlApiCommand({
      name: name.trim(),
      authenticationType: authType,
      userPoolConfig:
        authType === AUTH_TYPES.cognito
          ? { userPoolId, awsRegion: region, defaultAction: COGNITO_DEFAULT_ACTION }
          : undefined,
    }),
  );
  const apiId = graphqlApi?.apiId ?? "";
  // API đã tạo: bước sau lỗi thì vẫn mở API và báo, không báo "không tạo được" (thử lại sẽ tạo trùng)
  try {
    await saveSchema(appsync, apiId, STARTER_SCHEMA);
    if (authType === AUTH_TYPES.apiKey) {
      await appsync.send(
        new CreateApiKeyCommand({
          apiId,
          expires: apiKeyExpires(API_KEY_DAYS.default, Date.now()),
        }),
      );
    }
    return { apiId };
  } catch (error) {
    return { apiId, setupError: errorMessage(error) };
  }
}

export const updateApi = (appsync: AppSyncClient, update: UpdateGraphqlApiRequest) =>
  appsync.send(new UpdateGraphqlApiCommand(update));

export const deleteApi = (appsync: AppSyncClient, apiId: string) =>
  appsync.send(new DeleteGraphqlApiCommand({ apiId }));
