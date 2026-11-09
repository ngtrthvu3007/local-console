import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@shared/api.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import {
  RABBIT_ERROR_CODES,
  type CreateQueueInput,
  type Exchange,
  type PeekedMessage,
  type PublishInput,
  type PublishResult,
  type Queue,
} from "@server/routes/rabbitmq/contract.ts";
import { QUEUE_REFRESH_INTERVAL_MS, RABBIT_API_PATH } from "../constants.ts";

// Mọi dữ liệu RabbitMQ của một broker nằm dưới key này: ghi xong thì làm mới cả nhóm
const rabbitQueryKey = (broker: string) => ["mq", "rabbit", broker];

const rabbitUrl = (broker: string, path: string) =>
  `${RABBIT_API_PATH}/${encodeURIComponent(broker)}/${path}`;

const segment = encodeURIComponent;

// User/pass đi kèm từng request; backend chuyển nguyên sang RabbitMQ, không lưu
function send<T>(url: string, authorization: string, method = "GET", body?: unknown) {
  return fetchJson<T>(url, {
    method,
    headers: { authorization, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const isUnauthorized = (error: unknown) =>
  (error as { code?: string } | null)?.code === RABBIT_ERROR_CODES.unauthorized;

// Query key có cả user/pass: đăng nhập lại không đọc nhầm lỗi 401 cũ trong cache
// (chỉ nằm trong bộ nhớ, không lưu đi đâu)
export function useQueues(broker: string, authorization: string, autoRefresh: boolean) {
  return useQuery({
    queryKey: [...rabbitQueryKey(broker), authorization, "queues"],
    queryFn: () => send<Queue[]>(rabbitUrl(broker, "queues"), authorization),
    refetchInterval: autoRefresh ? QUEUE_REFRESH_INTERVAL_MS : false,
    retry: false,
  });
}

export function useExchanges(broker: string, authorization: string) {
  return useQuery({
    queryKey: [...rabbitQueryKey(broker), authorization, "exchanges"],
    queryFn: () => send<Exchange[]>(rabbitUrl(broker, "exchanges"), authorization),
    retry: false,
  });
}

// Ghi xong thì làm mới mọi dữ liệu RabbitMQ của broker
function useRabbitMutation<TInput, TResult>(
  broker: string,
  request: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rabbitQueryKey(broker) }),
  });
}

export const useCreateQueue = (broker: string, authorization: string) =>
  useRabbitMutation(broker, ({ name, ...input }: CreateQueueInput & { name: string }) =>
    send(rabbitUrl(broker, `queues/${segment(name)}`), authorization, "PUT", input),
  );

export const useDeleteQueues = (broker: string, authorization: string) =>
  useRabbitMutation(broker, async (names: string[]) => {
    const failures: string[] = [];
    for (const name of names) {
      try {
        await send(rabbitUrl(broker, `queues/${segment(name)}`), authorization, "DELETE");
      } catch (error) {
        failures.push(`${name}: ${errorMessage(error)}`);
      }
    }
    return { count: names.length - failures.length, failures };
  });

export const usePurgeQueue = (broker: string, authorization: string) =>
  useRabbitMutation(broker, (name: string) =>
    send(rabbitUrl(broker, `queues/${segment(name)}/messages`), authorization, "DELETE"),
  );

export const usePublish = (broker: string, authorization: string) =>
  useRabbitMutation(broker, ({ exchange, ...input }: PublishInput & { exchange: string }) =>
    send<PublishResult>(
      rabbitUrl(broker, `exchanges/${segment(exchange)}/publish`),
      authorization,
      "POST",
      input,
    ),
  );

// Xem trước cũng là thao tác ghi (message bị đánh dấu redelivered) nên chạy khi bấm, không cache
export const usePeek = (broker: string, authorization: string) =>
  useMutation({
    mutationFn: ({ queue, count }: { queue: string; count: number }) =>
      send<PeekedMessage[]>(
        rabbitUrl(broker, `queues/${segment(queue)}/peek`),
        authorization,
        "POST",
        { count },
      ),
  });
