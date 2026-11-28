import { useMutation, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { LOGS_KEYS, LOGS_QUERY_ROOT } from "@shared/logs/constants.ts";
import { useLogsService } from "@shared/logs/useLogsService.ts";

export function useLogGroups(prefix: string) {
  const logs = useLogsService();

  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.groups, prefix],
    queryFn: () => logs.listLogGroups(prefix),
  });
}

// Key riêng (không dùng chung với danh sách) để khi xóa có thể bỏ qua query của chính group đó
export function useLogGroup(name: string) {
  const logs = useLogsService();

  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.group, name],
    queryFn: () => logs.getLogGroup(name),
  });
}

const useInvalidateLogs = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LOGS_QUERY_ROOT] });
};

export function useCreateLogGroup() {
  const logs = useLogsService();
  const invalidate = useInvalidateLogs();

  return useMutation({ mutationFn: logs.createLogGroup, onSuccess: invalidate });
}

export function useDeleteLogGroups() {
  const logs = useLogsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logs.deleteLogGroups,
    onSuccess: (_result, names) => {
      // Không tải lại query của chính group vừa xóa (chi tiết, stream, filter, event): Floci trả 400, và
      // trang chi tiết chuyển sang not found, gỡ modal xóa trước khi kịp quay về danh sách. Chúng vốn
      // đã cũ (staleTime 0) nên mount lần sau tự tải lại
      const ofDeleted = (query: Query) =>
        query.queryKey[1] !== LOGS_KEYS.groups && names.includes(String(query.queryKey[2]));
      return queryClient.invalidateQueries({
        queryKey: [LOGS_QUERY_ROOT],
        predicate: (query) => !ofDeleted(query),
      });
    },
  });
}

export function usePutRetention(name: string) {
  const logs = useLogsService();
  const invalidate = useInvalidateLogs();

  return useMutation({
    mutationFn: (days: number | undefined) => logs.putRetention({ name, days }),
    onSuccess: invalidate,
  });
}
