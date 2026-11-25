import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateApiKeyCommand,
  DeleteApiKeyCommand,
  paginateListApiKeys,
  type ApiKey,
} from "@aws-sdk/client-appsync";
import { MILLISECONDS_PER_SECOND } from "@shared/constants.ts";
import { apiKeyExpires } from "../apis.ts";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSync } from "./useAppSync.ts";

const apiKeysQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "api-keys", apiId];

export function useApiKeys(apiId: string) {
  const client = useAppSync();

  return useQuery({
    queryKey: apiKeysQueryKey(apiId),
    queryFn: async () => {
      const keys: ApiKey[] = [];
      for await (const page of paginateListApiKeys({ client }, { apiId })) {
        keys.push(...(page.apiKeys ?? []));
      }
      return keys;
    },
  });
}

export function useCreateApiKey(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ description, days }: { description: string; days: number }) =>
      (
        await client.send(
          new CreateApiKeyCommand({
            apiId,
            description: description || undefined,
            expires: apiKeyExpires(days, Date.now()),
          }),
        )
      ).apiKey?.id ?? "",
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(apiId) }),
  });
}

export function useDeleteApiKey(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.send(new DeleteApiKeyCommand({ apiId, id })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(apiId) }),
  });
}

// Key còn hạn (expires là giây epoch)
export const isValidKey = (key: ApiKey, nowMs: number) =>
  (key.expires ?? 0) * MILLISECONDS_PER_SECOND > nowMs;
