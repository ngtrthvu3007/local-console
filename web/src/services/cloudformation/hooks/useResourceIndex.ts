import { useQuery } from "@tanstack/react-query";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { RESOURCE_INDEX_STALE_MS } from "../constants.ts";
import { buildResourceIndex } from "../resourceIndex.ts";

export const CLOUDFORMATION_QUERY_ROOT = "cloudformation";
export const resourceIndexQueryKey = [CLOUDFORMATION_QUERY_ROOT, "resource-index"];

// SDK nạp lười: không vào bundle chính (đừng import stacks.ts ở đầu file)
export function useResourceIndex() {
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: [...resourceIndexQueryKey, region],
    staleTime: RESOURCE_INDEX_STALE_MS,
    retry: false,
    queryFn: async () => {
      const { cloudFormationClient, listStacksWithResources } = await import("../stacks.ts");
      return buildResourceIndex(await listStacksWithResources(cloudFormationClient(region)));
    },
  });
}
