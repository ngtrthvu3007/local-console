import { useQuery } from "@tanstack/react-query";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { RESOURCE_INDEX_STALE_MS } from "../constants.ts";

export const CLOUDFORMATION_QUERY_ROOT = "cloudformation";
export const resourceIndexQueryKey = [CLOUDFORMATION_QUERY_ROOT, "resource-index"];

// StackLink có ở mọi trang: SDK CloudFormation nạp lười, không vào bundle chính
// (đừng import tĩnh stackLookup.ts hay barrel CloudFormation của core ở đây)
export function useResourceIndex() {
  const { region } = useLoadedConfig();

  return useQuery({
    queryKey: [...resourceIndexQueryKey, region],
    staleTime: RESOURCE_INDEX_STALE_MS,
    retry: false,
    queryFn: async () => (await import("../stackLookup.ts")).loadStackLookup(region),
  });
}
