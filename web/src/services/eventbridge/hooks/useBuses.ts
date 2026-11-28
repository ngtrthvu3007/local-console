import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useEventBridgeService } from "./useEventBridgeService.ts";

// Mọi query của EventBridge nằm dưới key gốc này
export const EVENTBRIDGE_QUERY_ROOT = "eventbridge";
const busesQueryKey = [EVENTBRIDGE_QUERY_ROOT, "buses"];

const startsWith = (key: QueryKey, prefix: QueryKey) =>
  prefix.every((part, index) => key[index] === part);

// Trừ chi tiết của resource vừa xóa: trang còn mở sẽ gọi lại và nhận 404
export const invalidateExcept = (queryClient: QueryClient, deleted: QueryKey[]) =>
  queryClient.invalidateQueries({
    queryKey: [EVENTBRIDGE_QUERY_ROOT],
    predicate: (query) => !deleted.some((key) => startsWith(query.queryKey, key)),
  });

export function useBuses() {
  const eventbridge = useEventBridgeService();

  return useQuery({ queryKey: busesQueryKey, queryFn: eventbridge.listBuses });
}

// Mọi thay đổi của EventBridge kéo theo nhiều nơi (số target ở danh sách rule, khối liên kết ở
// Lambda / SQS / SNS), nên làm mới cả nhóm
export function useInvalidateEventBridge() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [EVENTBRIDGE_QUERY_ROOT] });
}

export function useCreateBus() {
  const eventbridge = useEventBridgeService();
  const invalidate = useInvalidateEventBridge();

  return useMutation({ mutationFn: eventbridge.createBus, onSuccess: invalidate });
}

export function useDeleteBuses() {
  const eventbridge = useEventBridgeService();
  const invalidate = useInvalidateEventBridge();

  return useMutation({ mutationFn: eventbridge.deleteBuses, onSuccess: invalidate });
}

export function usePutEvent() {
  const eventbridge = useEventBridgeService();

  return useMutation({ mutationFn: eventbridge.putEvent });
}
