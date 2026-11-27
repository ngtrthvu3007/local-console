import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROOT_TYPES, readSchema } from "@localconsole/core/appsync";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSyncService } from "./useAppSyncService.ts";

const schemaQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "schema", apiId];

export function useSchema(apiId: string) {
  const appsync = useAppSyncService();

  return useQuery({ queryKey: schemaQueryKey(apiId), queryFn: () => appsync.getSchema(apiId) });
}

export function useSaveSchema(apiId: string) {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sdl: string) => appsync.saveSchema(apiId, sdl),
    // Đổi schema thì danh sách field / resolver cũng đổi
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPSYNC_QUERY_ROOT] }),
  });
}

// SDL không đọc được (cú pháp lạ): vẫn tra resolver của Query / Mutation
const FALLBACK_TYPES = ROOT_TYPES.slice(0, 2);

// Type / field đọc từ SDL đã lưu (ListTypes của Floci rỗng, spec 7 #2); types null = SDL không đọc được
export function useSchemaTypes(apiId: string) {
  const schema = useSchema(apiId);
  const types = useMemo(() => readSchema(schema.data ?? ""), [schema.data]);
  const typeNames = types ? types.map((type) => type.name) : FALLBACK_TYPES;
  return { schema, types, typeNames };
}
