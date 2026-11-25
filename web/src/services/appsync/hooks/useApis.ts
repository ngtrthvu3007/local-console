import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppSyncClient,
  CreateApiKeyCommand,
  CreateGraphqlApiCommand,
  DeleteGraphqlApiCommand,
  GetGraphqlApiCommand,
  GetSchemaCreationStatusCommand,
  StartSchemaCreationCommand,
  UpdateGraphqlApiCommand,
  paginateListGraphqlApis,
  type GraphqlApi,
  type UpdateGraphqlApiRequest,
} from "@aws-sdk/client-appsync";
import { orEmptyWhenNotFound } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { apiKeyExpires, schemaErrors } from "../apis.ts";
import {
  API_KEY_DAYS,
  AUTH_TYPES,
  COGNITO_DEFAULT_ACTION,
  SCHEMA_POLL,
  SCHEMA_STATUS,
} from "../constants.ts";
import { STARTER_SCHEMA } from "../resolverTemplates.ts";
import type { CreateApiForm } from "../schemas.ts";
import { useAppSync } from "./useAppSync.ts";

// Mọi query của AppSync nằm dưới key gốc này
export const APPSYNC_QUERY_ROOT = "appsync";
const apisQueryKey = [APPSYNC_QUERY_ROOT, "apis"];
export const apiQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "api", apiId];

export const SCHEMA_TIMEOUT = "Floci is still processing the schema. Refresh in a moment.";
const textEncoder = new TextEncoder();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useApis() {
  const client = useAppSync();

  return useQuery({
    queryKey: apisQueryKey,
    queryFn: async () => {
      const apis: GraphqlApi[] = [];
      for await (const page of paginateListGraphqlApis({ client }, {})) {
        apis.push(...(page.graphqlApis ?? []));
      }
      return apis;
    },
  });
}

// null = không có API
export function useApi(apiId: string) {
  const client = useAppSync();

  return useQuery({
    queryKey: apiQueryKey(apiId),
    queryFn: () =>
      orEmptyWhenNotFound(
        async () => (await client.send(new GetGraphqlApiCommand({ apiId }))).graphqlApi ?? null,
        null,
      ),
  });
}

// Lưu schema bất đồng bộ: hỏi trạng thái tới khi xong (spec 7 #3). FAILED → lỗi gom từ details
export async function saveSchema(client: AppSyncClient, apiId: string, sdl: string) {
  await client.send(new StartSchemaCreationCommand({ apiId, definition: textEncoder.encode(sdl) }));

  for (let waited = 0; waited < SCHEMA_POLL.timeoutMs; waited += SCHEMA_POLL.intervalMs) {
    await sleep(SCHEMA_POLL.intervalMs);
    const { status, details } = await client.send(new GetSchemaCreationStatusCommand({ apiId }));
    if (status === SCHEMA_STATUS.success) return;
    if (status === SCHEMA_STATUS.failed) throw new Error(schemaErrors(details).join("\n"));
  }
  throw new Error(SCHEMA_TIMEOUT);
}

// API mới có luôn schema mẫu: GetIntrospectionSchema của API chưa có schema trả 404 (spec 7 #17).
// Auth API key thì tạo luôn một key như AWS console
export function useCreateApi() {
  const client = useAppSync();
  const queryClient = useQueryClient();
  const { region } = useLoadedConfig();

  return useMutation({
    mutationFn: async ({ name, authType, userPoolId }: CreateApiForm) => {
      const { graphqlApi } = await client.send(
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
        await saveSchema(client, apiId, STARTER_SCHEMA);
        if (authType === AUTH_TYPES.apiKey) {
          await client.send(
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPSYNC_QUERY_ROOT] }),
  });
}

export function useUpdateApi() {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: UpdateGraphqlApiRequest) =>
      client.send(new UpdateGraphqlApiCommand(update)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPSYNC_QUERY_ROOT] }),
  });
}

// Chỉ làm mới danh sách: tải lại API vừa xóa thì 404, trình duyệt ghi lỗi trước khi trang kịp chuyển
export function useDeleteApi() {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (apiId: string) => client.send(new DeleteGraphqlApiCommand({ apiId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apisQueryKey }),
  });
}
