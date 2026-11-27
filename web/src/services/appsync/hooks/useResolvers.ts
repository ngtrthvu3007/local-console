import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateResolverCommand,
  DeleteResolverCommand,
  UpdateResolverCommand,
  paginateListResolvers,
  type Resolver,
} from "@aws-sdk/client-appsync";
import { resolverInput } from "../apis.ts";
import type { ResolverForm } from "../schemas.ts";
import { APPSYNC_QUERY_ROOT } from "./useApis.ts";
import { useAppSync } from "./useAppSync.ts";

export const resolversQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "resolvers", apiId];

// ListResolvers chỉ theo từng type: gọi cho mọi type của schema, song song
export function useResolvers(apiId: string, typeNames: readonly string[]) {
  const client = useAppSync();

  return useQuery({
    queryKey: [...resolversQueryKey(apiId), ...typeNames],
    enabled: typeNames.length > 0,
    queryFn: async () => {
      const perType = await Promise.all(
        typeNames.map(async (typeName) => {
          const resolvers: Resolver[] = [];
          for await (const page of paginateListResolvers({ client }, { apiId, typeName })) {
            resolvers.push(...(page.resolvers ?? []));
          }
          return resolvers;
        }),
      );
      return perType.flat();
    },
  });
}

export function useDeleteResolver(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ typeName, fieldName }: { typeName: string; fieldName: string }) =>
      client.send(new DeleteResolverCommand({ apiId, typeName, fieldName })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resolversQueryKey(apiId) }),
  });
}

interface SaveResolverInput {
  typeName: string;
  fieldName: string;
  exists: boolean;
  form: ResolverForm;
}

export function useSaveResolver(apiId: string) {
  const client = useAppSync();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ typeName, fieldName, exists, form }: SaveResolverInput) => {
      const input = { apiId, ...resolverInput(form, typeName, fieldName) };
      return client.send(
        exists ? new UpdateResolverCommand(input) : new CreateResolverCommand(input),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resolversQueryKey(apiId) }),
  });
}
