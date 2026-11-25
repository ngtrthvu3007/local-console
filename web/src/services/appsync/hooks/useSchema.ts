import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GetIntrospectionSchemaCommand } from "@aws-sdk/client-appsync";
import { orEmptyWhenNotFound } from "@shared/aws.ts";
import { readSchema, sdlOfIntrospection } from "../apis.ts";
import { ROOT_TYPES } from "../constants.ts";
import { APPSYNC_QUERY_ROOT, saveSchema } from "./useApis.ts";
import { useAppSync } from "./useAppSync.ts";

const schemaQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "schema", apiId];
// Đọc schema dạng SDL (format JSON của Floci cũng trả SDL, spec 7 #2)
const SCHEMA_FORMAT = "SDL";
const textDecoder = new TextDecoder();

// SDL đã lưu; null = API chưa có schema (Floci trả 404, spec 7 #17)
export function useSchema(apiId: string) {
  const client = useAppSync();

  return useQuery({
    queryKey: schemaQueryKey(apiId),
    queryFn: () =>
      orEmptyWhenNotFound(async () => {
        const { schema } = await client.send(
          new GetIntrospectionSchemaCommand({ apiId, format: SCHEMA_FORMAT }),
        );
        return schema ? sdlOfIntrospection(textDecoder.decode(schema)) : null;
      }, null),
  });
}

export function useSaveSchema(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sdl: string) => saveSchema(client, apiId, sdl),
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
