import { MILLISECONDS_PER_SECOND } from "@localconsole/core/shared";
import { REDIS_KEY_TYPES } from "@server/routes/redis/contract.ts";

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
export const VALUE_PREVIEW_MAX_LENGTH = 200;
export const STRING_EDITOR_HEIGHT_PX = 240;
