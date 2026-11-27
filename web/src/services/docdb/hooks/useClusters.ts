import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDocDbService } from "./useDocDbService.ts";

// Query duy nhất của DocumentDB: cluster kèm instance của chúng
export const clustersKey = ["docdb", "clusters"];

export function useClusters() {
  const docdb = useDocDbService();

  return useQuery({ queryKey: clustersKey, queryFn: docdb.listClusters });
}

// null = không có. Dò trong danh sách: DescribeDBClusters theo identifier trả 404 → console.error
export function useCluster(id: string) {
  const clusters = useClusters();
  const data = clusters.data && (clusters.data.find((cluster) => cluster.id === id) ?? null);
  return { ...clusters, data };
}

export function useCreateCluster() {
  const docdb = useDocDbService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: docdb.createCluster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}

export function useDeleteClusters() {
  const docdb = useDocDbService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: docdb.deleteClusters,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersKey }),
  });
}
