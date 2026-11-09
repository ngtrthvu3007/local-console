import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@shared/api.ts";
import {
  REDIS_ERROR_CODES,
  type CreateKeyInput,
  type KeyPage,
  type KeyUpdate,
  type KeyValue,
  type RedisKeyType,
  type ServerInfo,
  type TtlInput,
} from "@server/routes/redis/contract.ts";
import { REDIS_API_PATH, START_CURSOR } from "../constants.ts";

// Mọi dữ liệu Redis của một cluster nằm dưới key này: ghi xong thì làm mới cả nhóm
const redisQueryKey = (cluster: string) => ["elasticache", "redis", cluster];

const JSON_HEADERS = { "Content-Type": "application/json" };

function redisUrl(cluster: string, path: string, query: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value) search.set(name, value);
  const queryText = search.size ? `?${search}` : "";
  return `${REDIS_API_PATH}/${encodeURIComponent(cluster)}/${path}${queryText}`;
}

const send = <T>(url: string, method: string, body?: unknown) =>
  fetchJson<T>(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) });

export const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;
export const isKeyNotFound = (error: unknown) => errorCode(error) === REDIS_ERROR_CODES.keyNotFound;

export interface KeyFilter {
  pattern: string;
  type?: RedisKeyType;
}

// runId: bấm Run lần nữa với cùng điều kiện vẫn tải lại từ đầu.
// enabled: cluster chưa sẵn sàng (đang tạo) thì chưa gọi
export function useKeyPages(cluster: string, filter: KeyFilter, runId: number, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...redisQueryKey(cluster), "keys", filter, runId],
    enabled,
    initialPageParam: START_CURSOR,
    queryFn: ({ pageParam }) =>
      fetchJson<KeyPage>(
        redisUrl(cluster, "keys", {
          pattern: filter.pattern,
          type: filter.type,
          cursor: pageParam,
        }),
      ),
    getNextPageParam: (page) => page.cursor ?? undefined,
    retry: false,
  });
}

// Gộp các trang của một key: thông tin chung lấy từ trang mới nhất, phần tử nối lại
export function mergeKeyPages(pages: KeyValue[]): KeyValue {
  const latest = pages[pages.length - 1];
  if (!("items" in latest)) return latest;
  // Mọi trang cùng một kiểu key nên nối thẳng được
  const items = pages.flatMap<unknown>((page) => ("items" in page ? page.items : []));
  return { ...latest, items } as KeyValue;
}

export function useKeyValue(cluster: string, name: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...redisQueryKey(cluster), "key", name],
    enabled: Boolean(name),
    initialPageParam: START_CURSOR,
    queryFn: ({ pageParam }) =>
      fetchJson<KeyValue>(redisUrl(cluster, "key", { name, cursor: pageParam })),
    getNextPageParam: (page) => ("cursor" in page ? (page.cursor ?? undefined) : undefined),
    retry: false,
  });
}

export type KeyValueQuery = ReturnType<typeof useKeyValue>;

export function useServerInfo(cluster: string, enabled: boolean) {
  return useQuery({
    queryKey: [...redisQueryKey(cluster), "info"],
    enabled,
    queryFn: () => fetchJson<ServerInfo>(redisUrl(cluster, "info")),
    retry: false,
  });
}

// Ghi xong thì làm mới mọi dữ liệu Redis của cluster (danh sách key, key đang mở, số key)
function useRedisMutation<TInput>(cluster: string, request: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redisQueryKey(cluster) }),
  });
}

export const useCreateKey = (cluster: string) =>
  useRedisMutation(cluster, (input: CreateKeyInput) =>
    send(redisUrl(cluster, "keys"), "POST", input),
  );

export const useDeleteKeys = (cluster: string) =>
  useRedisMutation(cluster, (names: string[]) =>
    send<{ deleted: number }>(redisUrl(cluster, "keys/delete"), "POST", { names }),
  );

export const useUpdateKey = (cluster: string, name: string) =>
  useRedisMutation(cluster, (update: KeyUpdate) =>
    send(redisUrl(cluster, "key", { name }), "PATCH", update),
  );

export const useSetTtl = (cluster: string, name: string) =>
  useRedisMutation(cluster, (input: TtlInput) =>
    send(redisUrl(cluster, "key/ttl", { name }), "PUT", input),
  );

export const useFlushDatabase = (cluster: string) =>
  useRedisMutation(cluster, () => send(redisUrl(cluster, "flush"), "POST"));
