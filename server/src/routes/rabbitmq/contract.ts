// Hợp đồng API RabbitMQ giữa server và web (web import lại file này qua alias @server).
// Chỉ chứa type và hằng số thuần, không import gì của Node.

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

export interface CreateQueueInput {
  durable: boolean;
}

export interface PublishInput {
  routingKey: string;
  payload: string;
}

export interface PublishResult {
  routed: boolean; // false = không vào queue nào
}

export interface PeekInput {
  count: number;
}

export interface PeekedMessage {
  payload: string;
  payloadEncoding: string; // "string" hoặc "base64" (payload binary)
  routingKey: string;
  exchange: string;
  redelivered: boolean;
  properties: Record<string, unknown>;
}
