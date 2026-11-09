import { MILLISECONDS_PER_SECOND } from "@shared/constants.ts";
import { REDIS_KEY_TYPES } from "@server/routes/redis/contract.ts";

export const ENGINE_LABELS: Record<string, string> = {
  valkey: "Valkey",
  redis: "Redis OSS",
};
export const DEFAULT_ENGINE = "valkey";
// AWS bắt buộc node type; Floci bỏ qua và luôn chạy valkey/valkey:8
export const CACHE_NODE_TYPE = "cache.t3.micro";
// Cluster tạo từ console: một node, không replica
export const NODE_COUNT = 1;

// Luật tên của ElastiCache
export const CLUSTER_NAME_MAX_LENGTH = 40;
export const CLUSTER_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const DOUBLE_HYPHEN = "--";
export const HYPHEN = "-";

export const CLUSTER_STATUS_AVAILABLE = "available";
export const FAILED_STATUSES = ["create-failed", "restore-failed", "incompatible-network"];
// Cluster đang đổi trạng thái thì tự tải lại cho tới khi xong
export const CLUSTER_REFRESH_INTERVAL_MS = 2 * MILLISECONDS_PER_SECOND;

export const REDIS_API_PATH = "/api/redis";
export const REDIS_URL_SCHEME = "redis://";
export const ALL_KEYS_PATTERN = "*";
export const START_CURSOR = "0";

export const KEY_TYPE_LABELS: Record<string, string> = {
  string: "string",
  hash: "hash",
  list: "list",
  set: "set",
  zset: "sorted set",
};
export const KEY_TYPE_OPTIONS = REDIS_KEY_TYPES.map((value) => ({
  value,
  label: KEY_TYPE_LABELS[value],
}));
export const ALL_TYPES_OPTION = { value: "", label: "All types" };

export const NODE_ROLE_LABELS: Record<string, string> = {
  primary: "Primary",
  replica: "Replica",
};

// Panel hẹp hơn mức này thì bảng trong panel thành hai tầng
export const PANEL_LIST_WIDTH_PX = 400;
// Ô value trong bảng chỉ hiện một dòng
export const VALUE_PREVIEW_MAX_LENGTH = 200;
export const EDITOR_HEIGHT_PX = 360;
export const STRING_EDITOR_HEIGHT_PX = 240;
