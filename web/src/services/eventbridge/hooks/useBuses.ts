import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { runEach } from "@shared/hooks/useNotify.ts";
import { listBuses, type Bus } from "../buses.ts";
import { deleteRule, listRules } from "../rules.ts";
import { useEventBridge } from "./useEventBridge.ts";

// Mọi query của EventBridge nằm dưới key gốc này
export const EVENTBRIDGE_QUERY_ROOT = "eventbridge";
const busesQueryKey = [EVENTBRIDGE_QUERY_ROOT, "buses"];

const startsWith = (key: QueryKey, prefix: QueryKey) =>
  prefix.every((part, index) => key[index] === part);

// Làm mới mọi query của EventBridge, trừ chi tiết của resource vừa xóa: trang chi tiết còn mở
// sẽ gọi lại resource vừa mất (404); rời trang rồi thì lần mở sau tự hỏi lại
export const invalidateExcept = (queryClient: QueryClient, deleted: QueryKey[]) =>
  queryClient.invalidateQueries({
    queryKey: [EVENTBRIDGE_QUERY_ROOT],
    predicate: (query) => !deleted.some((key) => startsWith(query.queryKey, key)),
  });

export function useBuses() {
  const client = useEventBridge();
  return useQuery({ queryKey: busesQueryKey, queryFn: () => listBuses(client) });
}

// Mọi thay đổi của EventBridge kéo theo nhiều nơi (số target ở danh sách rule, khối liên kết ở
// Lambda / SQS / SNS), nên làm mới cả nhóm
export function useInvalidateEventBridge() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [EVENTBRIDGE_QUERY_ROOT] });
}

export function useCreateBus() {
  const client = useEventBridge();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: (name: string) => client.send(new CreateEventBusCommand({ Name: name })),
    onSuccess: invalidate,
  });
}

export function useDeleteBuses() {
  const client = useEventBridge();
  const invalidate = useInvalidateEventBridge();
  return useMutation({
    mutationFn: (buses: readonly Bus[]) =>
      runEach(
        buses,
        (bus) => bus.name,
        async (bus) => {
          // Rule nằm trong bus nên xóa cùng
          for (const rule of await listRules(client, bus.name))
            await deleteRule(client, bus.name, rule.name);
          await client.send(new DeleteEventBusCommand({ Name: bus.name }));
        },
      ),
    onSuccess: invalidate,
  });
}

interface PutEventInput {
  bus: string;
  source: string;
  detailType: string;
  detail: string;
}

export function usePutEvent() {
  const client = useEventBridge();
  return useMutation({
    mutationFn: async ({ bus, source, detailType, detail }: PutEventInput) => {
      const result = await client.send(
        new PutEventsCommand({
          Entries: [{ EventBusName: bus, Source: source, DetailType: detailType, Detail: detail }],
        }),
      );
      const entry = result.Entries?.[0];
      // PutEvents báo lỗi từng entry ở đây chứ không ném
      if (result.FailedEntryCount)
        throw new Error(entry?.ErrorMessage ?? "Couldn't send the event");
      return entry?.EventId;
    },
  });
}
