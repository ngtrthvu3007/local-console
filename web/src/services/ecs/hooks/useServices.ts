import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServiceUpdate, ServiceValues } from "@localconsole/core/ecs";
import { clusterKey, useEcsService } from "./useEcsService.ts";

// Dưới key của cluster: chạy / dừng task cũng làm số liệu service đổi
const servicesKey = (cluster: string) => [...clusterKey(cluster), "services"];

export function useServices(cluster: string, enabled: boolean) {
  const ecs = useEcsService();

  return useQuery({
    queryKey: servicesKey(cluster),
    queryFn: () => ecs.listServices(cluster),
    enabled,
  });
}

export function useService(cluster: string, name: string, enabled: boolean) {
  const ecs = useEcsService();

  return useQuery({
    // Ngoài key danh sách: xóa từ trang chi tiết không tải lại trang thành "not found" trước khi rời đi
    queryKey: [...clusterKey(cluster), "service", name],
    queryFn: () => ecs.getService(cluster, name),
    enabled,
  });
}

export function useCreateService(cluster: string) {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: ServiceValues) => ecs.createService(cluster, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKey(cluster) }),
  });
}

export function useUpdateService(cluster: string, service: string) {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: ServiceUpdate) => ecs.updateService(cluster, service, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKey(cluster) }),
  });
}

export function useDeleteServices(cluster: string) {
  const ecs = useEcsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: readonly string[]) => ecs.deleteServices(cluster, names),
    // Danh sách service + số đếm trên header cluster; không đụng query chi tiết service (xóa từ trang
    // chi tiết mà tải lại nó thì trang thành "not found" trước khi kịp rời đi)
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: servicesKey(cluster) }),
        queryClient.invalidateQueries({ queryKey: clusterKey(cluster), exact: true }),
      ]),
  });
}
