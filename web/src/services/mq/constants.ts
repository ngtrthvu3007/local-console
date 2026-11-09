import { MILLISECONDS_PER_SECOND } from "@shared/constants.ts";

// Floci chỉ hỗ trợ RabbitMQ một node; version và instance type là nhãn, Floci bỏ qua
export const ENGINE_TYPE = "RABBITMQ";
export const ENGINE_LABEL = "RabbitMQ";
export const ENGINE_VERSION = "3.13";
export const HOST_INSTANCE_TYPE = "mq.t3.micro";
export const DEPLOYMENT_MODE = "SINGLE_INSTANCE";

export const BROKER_RUNNING = "RUNNING";
export const FAILED_STATES = ["CREATION_FAILED", "CRITICAL_ACTION_REQUIRED"];
// Broker đang đổi trạng thái thì tự tải lại cho tới khi xong
export const BROKER_REFRESH_INTERVAL_MS = 2 * MILLISECONDS_PER_SECOND;
// Công tắc Auto refresh của tab Queues (spec chính, mục 4)
export const QUEUE_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;

// Luật của Amazon MQ
export const BROKER_NAME_MAX_LENGTH = 50;
export const BROKER_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
export const USERNAME_LENGTH = { min: 2, max: 100 };
export const USERNAME_PATTERN = /^[A-Za-z0-9._~-]+$/;
export const RESERVED_USERNAME = "guest";
export const PASSWORD_LENGTH = { min: 12, max: 250 };
export const PASSWORD_MIN_UNIQUE_CHARACTERS = 4;
export const PASSWORD_FORBIDDEN_CHARACTERS = [",", ":", "="];

export const RABBIT_API_PATH = "/api/mq";
export const DEFAULT_EXCHANGE_LABEL = "(AMQP default)";
export const PEEK_COUNT = { default: 10, min: 1, max: 50 };
export const PAYLOAD_EDITOR_HEIGHT_PX = 200;

// Floci map cổng của từng broker ra máy dev theo thứ tự, nhưng không báo cổng nào (spec MQ, mục 6 #3)
export const HOST_PORT_HINT =
  "From your machine: localhost, port 5672 for the first broker (range 5672–5699; management 15672–15699). Run docker ps to see each broker's port.";
