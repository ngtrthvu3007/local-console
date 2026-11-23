// Hợp đồng API RabbitMQ server ↔ web (web import qua @server): chỉ type, schema zod, hằng số; không import Node
import { z } from "zod";

export const RABBIT_ERROR_CODES = {
  brokerNotFound: "BrokerNotFound",
  brokerNotReady: "BrokerNotReady",
  unauthorized: "Unauthorized",
  notFound: "NotFound",
  alreadyExists: "AlreadyExists",
  rabbitError: "RabbitError",
  brokerUnavailable: "BrokerUnavailable",
} as const;

// Exchange mặc định (tên rỗng) có tên riêng trong API quản lý; web gửi tên này khi publish thẳng vào queue
export const DEFAULT_EXCHANGE = "amq.default";

export interface Queue {
  name: string;
  type: string; // classic, quorum, stream
  durable: boolean;
  messages: number | null; // null: queue vừa tạo, RabbitMQ chưa có thống kê (cập nhật chậm khoảng 5 giây)
}

export interface Exchange {
  name: string; // "" là exchange mặc định
  type: string;
  durable: boolean;
}

export const PEEK_COUNT = { default: 10, min: 1, max: 50 };

export const createQueueInputSchema = z.object({ durable: z.boolean() });
export type CreateQueueInput = z.infer<typeof createQueueInputSchema>;

export const publishInputSchema = z.object({ routingKey: z.string(), payload: z.string() });
export type PublishInput = z.infer<typeof publishInputSchema>;

export const peekInputSchema = z.object({
  count: z.number().int().min(PEEK_COUNT.min).max(PEEK_COUNT.max),
});

export interface PublishResult {
  routed: boolean; // false = không vào queue nào
}

export interface PeekedMessage {
  payload: string;
  payloadEncoding: string; // "string" hoặc "base64" (payload binary)
  routingKey: string;
  exchange: string;
  redelivered: boolean;
  properties: Record<string, unknown>;
}
