export const RABBIT_API_PATH = "/api/mq";
export const DEFAULT_EXCHANGE_LABEL = "(AMQP default)";
export const PAYLOAD_EDITOR_HEIGHT_PX = 200;

// Floci không báo cổng của broker và không luôn bắt đầu từ 5672 nên không ghi số cụ thể
export const HOST_PORT_HINT =
  "From your machine: localhost, on a port in 5672–5699 (management 15672–15699). Run docker ps to see each broker's port.";
