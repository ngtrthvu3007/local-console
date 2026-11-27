import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isTransitional } from "@localconsole/core/elasticache";
import { CLUSTER_REFRESH_INTERVAL_MS } from "../constants.ts";
import { useElastiCacheService } from "./useElastiCacheService.ts";

const clustersQueryKey = ["elasticache", "clusters"];

export function useClusters() {
  const elasticache = useElastiCacheService();

  return useQuery({
    queryKey: clustersQueryKey,
    queryFn: elasticache.listClusters,
    refetchInterval: (query) =>
      query.state.data?.some(isTransitional) ? CLUSTER_REFRESH_INTERVAL_MS : false,
  });
}

// Local ít cluster nên lấy từ danh sách, không gọi riêng
export function useCluster(id: string) {
  const clusters = useClusters();
  return { ...clusters, data: clusters.data?.find((cluster) => cluster.id === id) };
}

export function useCreateCluster() {
  const elasticache = useElastiCacheService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: elasticache.createCluster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersQueryKey }),
  });
}

export function useDeleteClusters() {
  const elasticache = useElastiCacheService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: elasticache.deleteClusters,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersQueryKey }),
  });
}
