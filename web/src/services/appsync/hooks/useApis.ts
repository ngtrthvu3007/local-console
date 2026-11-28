import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSyncService } from "./useAppSyncService.ts";

// Mọi query của AppSync nằm dưới key gốc này
export const APPSYNC_QUERY_ROOT = "appsync";
const apisQueryKey = [APPSYNC_QUERY_ROOT, "apis"];
export const apiQueryKey = (apiId: string) => [APPSYNC_QUERY_ROOT, "api", apiId];

export function useApis() {
  const appsync = useAppSyncService();

  return useQuery({ queryKey: apisQueryKey, queryFn: appsync.listApis });
}

export function useApi(apiId: string) {
  const appsync = useAppSyncService();

  return useQuery({ queryKey: apiQueryKey(apiId), queryFn: () => appsync.getApi(apiId) });
}

export function useCreateApi() {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: appsync.createApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPSYNC_QUERY_ROOT] }),
  });
}

export function useUpdateApi() {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: appsync.updateApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPSYNC_QUERY_ROOT] }),
  });
}

// Chỉ làm mới danh sách: tải lại API vừa xóa thì 404, trình duyệt ghi lỗi trước khi trang kịp chuyển
export function useDeleteApi() {
  const appsync = useAppSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: appsync.deleteApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apisQueryKey }),
  });
}
