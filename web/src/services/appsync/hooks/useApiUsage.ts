import { usageOf } from "../apis.ts";
import { useApiFunctions } from "./useFunctions.ts";
import { useResolvers } from "./useResolvers.ts";
import { useSchemaTypes } from "./useSchema.ts";

// Data source / function nào đang được resolver / function dùng: chặn xóa (spec 7 #8)
export function useApiUsage(apiId: string) {
  const { schema, typeNames } = useSchemaTypes(apiId);
  const resolvers = useResolvers(apiId, typeNames);
  const functions = useApiFunctions(apiId);
  return {
    ...usageOf(resolvers.data ?? [], functions.data ?? []),
    // Chưa tải xong thì chưa biết "đang dùng": khóa xóa (mở thẳng tab Data sources từ CloudFormation…)
    loading: schema.isLoading || resolvers.isPending || functions.isPending,
  };
}
