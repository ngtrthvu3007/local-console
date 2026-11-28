import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ECS_QUERY_ROOT, clusterKey, useEcsService } from "./useEcsService.ts";

const clustersQueryKey = [ECS_QUERY_ROOT, "clusters"];

export function useClusters() {
  const ecs = useEcsService();

  return useQuery({ queryKey: clustersQueryKey, queryFn: ecs.listClusters });
}

export function useCluster(name: string) {
  const ecs = useEcsService();

  return useQuery({ queryKey: clusterKey(name), queryFn: () => ecs.getCluster(name) });
}

export function useCreateCluster() {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ecs.createCluster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ECS_QUERY_ROOT] }),
  });
}

export function useDeleteClusters() {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ecs.deleteClusters,
    // Không tải lại query chi tiết: xóa từ trang chi tiết thì trang sẽ thành "not found" trước khi về danh sách
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clustersQueryKey }),
  });
}
