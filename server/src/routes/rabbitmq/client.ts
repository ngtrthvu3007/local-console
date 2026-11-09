import { DescribeBrokerCommand, type MqClient } from "@aws-sdk/client-mq";
import {
  HTTP_BAD_GATEWAY,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from "../../constants.ts";
import { reachableHost } from "../../flociHost.ts";
import { HttpError } from "../../middleware/error.ts";
import {
  RABBIT_ERROR_CODES,
  type CreateQueueInput,
  type Exchange,
  type PeekedMessage,
  type PublishInput,
  type PublishResult,
  type Queue,
} from "./contract.ts";

// Không kết nối được thì báo lỗi sau 5 giây, không treo (spec chính, mục 7)
const REQUEST_TIMEOUT_MS = 5000;
const BROKER_RUNNING = "RUNNING";
const NOT_FOUND_EXCEPTION = "NotFoundException";
// Amazon MQ dùng vhost mặc định "/"; API quản lý cần mã hóa thành %2F
const VHOST = encodeURIComponent("/");
const QUEUE_COLUMNS = "name,type,durable,messages";
const EXCHANGE_COLUMNS = "name,type,durable,internal";
// Xem trước: lấy rồi trả lại queue, message không mất (bị đánh dấu redelivered)
const PEEK_ACK_MODE = "ack_requeue_true";
const PEEK_ENCODING = "auto";
const PEEK_TRUNCATE_BYTES = 50_000;

interface RabbitError {
  reason?: string;
}

interface RawMessage {
  payload: string;
  payload_encoding: string;
  routing_key: string;
  exchange: string;
  redelivered: boolean;
  properties: Record<string, unknown>;
}

export function createRabbitConnector(mq: MqClient, flociUrl: string) {
  // Trình duyệt chỉ gửi broker ID; địa chỉ luôn tra từ Floci, không nhận địa chỉ tùy ý
  async function managementUrl(broker: string): Promise<string> {
    let description;
    try {
      description = await mq.send(new DescribeBrokerCommand({ BrokerId: broker }));
    } catch (error) {
      if ((error as Error).name === NOT_FOUND_EXCEPTION) {
        throw new HttpError(
          HTTP_NOT_FOUND,
          RABBIT_ERROR_CODES.brokerNotFound,
          `Broker ${broker} not found`,
        );
      }
      throw error;
    }
    const consoleUrl = description.BrokerInstances?.[0]?.ConsoleURL;
    if (description.BrokerState !== BROKER_RUNNING || !consoleUrl) {
      throw new HttpError(
        HTTP_CONFLICT,
        RABBIT_ERROR_CODES.brokerNotReady,
        `Broker ${broker} is not running`,
      );
    }
    const url = new URL(consoleUrl);
    url.hostname = reachableHost(url.hostname, flociUrl);
    return url.origin;
  }

  // Gọi API quản lý của RabbitMQ bằng user/pass trình duyệt gửi kèm; backend không lưu
  return async function callRabbit<T>(
    broker: string,
    authorization: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const base = await managementUrl(broker);
    let response: Response;
    try {
      response = await fetch(`${base}/api${path}`, {
        method: init.method,
        headers: { authorization, "content-type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new HttpError(
        HTTP_BAD_GATEWAY,
        RABBIT_ERROR_CODES.brokerUnavailable,
        `Can't reach broker ${broker}: ${(error as Error).message}`,
      );
    }
    if (response.ok) {
      // Tạo/xóa trả 201/204 với body rỗng
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
    const reason = ((await response.json().catch(() => ({}))) as RabbitError).reason;
    if (response.status === HTTP_UNAUTHORIZED) {
      throw new HttpError(
        HTTP_UNAUTHORIZED,
        RABBIT_ERROR_CODES.unauthorized,
        "Wrong username or password",
      );
    }
    if (response.status === HTTP_NOT_FOUND) {
      throw new HttpError(
        HTTP_NOT_FOUND,
        RABBIT_ERROR_CODES.notFound,
        "The queue or exchange no longer exists",
      );
    }
    throw new HttpError(
      HTTP_BAD_REQUEST,
      RABBIT_ERROR_CODES.rabbitError,
      reason ?? `HTTP ${response.status}`,
    );
  };
}

export type CallRabbit = ReturnType<typeof createRabbitConnector>;

// Hàm gọi đã gắn broker và user/pass của một request
export type Rabbit = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

const queuePath = (name: string) => `/queues/${VHOST}/${encodeURIComponent(name)}`;
const exchangePath = (name: string) => `/exchanges/${VHOST}/${encodeURIComponent(name)}`;

export async function listQueues(rabbit: Rabbit): Promise<Queue[]> {
  const queues = await rabbit<(Omit<Queue, "messages"> & { messages?: number })[]>(
    `/queues/${VHOST}?columns=${QUEUE_COLUMNS}`,
  );
  // Queue vừa tạo chưa có thống kê nên RabbitMQ bỏ trường messages
  return queues.map((queue) => ({ ...queue, messages: queue.messages ?? null }));
}

export async function listExchanges(rabbit: Rabbit): Promise<Exchange[]> {
  const exchanges = await rabbit<(Exchange & { internal: boolean })[]>(
    `/exchanges/${VHOST}?columns=${EXCHANGE_COLUMNS}`,
  );
  // Exchange nội bộ (amq.rabbitmq.trace) không publish được
  return exchanges
    .filter((exchange) => !exchange.internal)
    .map(({ name, type, durable }) => ({ name, type, durable }));
}

export async function createQueue(rabbit: Rabbit, name: string, input: CreateQueueInput) {
  // Tạo trùng với cùng cấu hình thì RabbitMQ không báo lỗi, nên kiểm tra trước
  const exists = await rabbit(queuePath(name)).then(
    () => true,
    (error: unknown) => {
      if ((error as HttpError).code === RABBIT_ERROR_CODES.notFound) return false;
      throw error;
    },
  );
  if (exists) {
    throw new HttpError(
      HTTP_CONFLICT,
      RABBIT_ERROR_CODES.alreadyExists,
      "A queue with this name already exists",
    );
  }
  await rabbit(queuePath(name), {
    method: "PUT",
    body: { durable: input.durable, auto_delete: false, arguments: {} },
  });
}

export const deleteQueue = (rabbit: Rabbit, name: string) =>
  rabbit(queuePath(name), { method: "DELETE" });

export const purgeQueue = (rabbit: Rabbit, name: string) =>
  rabbit(`${queuePath(name)}/contents`, { method: "DELETE" });

export const publish = (rabbit: Rabbit, exchange: string, input: PublishInput) =>
  rabbit<PublishResult>(`${exchangePath(exchange)}/publish`, {
    method: "POST",
    body: {
      properties: {},
      routing_key: input.routingKey,
      payload: input.payload,
      payload_encoding: "string",
    },
  });

export async function peek(rabbit: Rabbit, name: string, count: number): Promise<PeekedMessage[]> {
  const messages = await rabbit<RawMessage[]>(`${queuePath(name)}/get`, {
    method: "POST",
    body: {
      count,
      ackmode: PEEK_ACK_MODE,
      encoding: PEEK_ENCODING,
      truncate: PEEK_TRUNCATE_BYTES,
    },
  });
  return messages.map((message) => ({
    payload: message.payload,
    payloadEncoding: message.payload_encoding,
    routingKey: message.routing_key,
    exchange: message.exchange,
    redelivered: message.redelivered,
    // Không có property nào thì RabbitMQ trả mảng rỗng thay vì object
    properties: Array.isArray(message.properties) ? {} : message.properties,
  }));
}
