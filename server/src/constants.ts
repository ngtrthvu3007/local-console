export const DEFAULTS = {
  port: 3701,
  flociInternalUrl: "http://floci:4566", // gọi từ trong Docker
  flociPublicUrl: "http://localhost:4566", // gọi từ trình duyệt
  region: "ap-southeast-1", // region cha của Hanoi Local Zone
} as const;

export const MIN_PORT = 1;
export const MAX_PORT = 65535;

// Console contract của Floci: bind mọi interface, health trả lời trong 1 giây
export const BIND_ADDRESS = "0.0.0.0";
export const HEALTH_TIMEOUT_MS = 800;

export const ROUTES = {
  health: "/api/health",
  config: "/api/config",
  apiPrefix: "/api",
  awsProxy: "/aws",
  redis: "/api/redis",
  rabbitmq: "/api/mq",
  spaFallback: "/{*path}",
} as const;

// Floci nhận credential bất kỳ
export const AWS_TEST_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" } as const;

export const FLOCI_HEALTH_PATH = "/_floci/health";
export const SPA_INDEX_FILE = "index.html";

export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_INTERNAL_ERROR = 500;
export const HTTP_BAD_GATEWAY = 502;
export const NOT_FOUND_ERROR_CODE = "NotFound";
