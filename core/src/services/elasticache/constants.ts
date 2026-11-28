export const ENGINE_LABELS: Record<string, string> = {
  valkey: "Valkey",
  redis: "Redis OSS",
};
export const DEFAULT_ENGINE = "valkey";
// AWS bắt buộc node type; Floci bỏ qua và luôn chạy valkey/valkey:8
export const CACHE_NODE_TYPE = "cache.t3.micro";
export const NODE_COUNT = 1;
export const MEMCACHED_ENGINE = "memcached";
// Tên group theo mẫu AWS, id là ReplicationGroupId; để link qua lại với trang CloudWatch Logs
export const ELASTICACHE_LOG_GROUP_PREFIX = "/aws/elasticache/cluster/";
export const engineLogGroup = (id: string) => `${ELASTICACHE_LOG_GROUP_PREFIX}${id}/engine-log`;

export const CLUSTER_NAME_MAX_LENGTH = 40;
export const CLUSTER_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const DOUBLE_HYPHEN = "--";
export const HYPHEN = "-";

export const CLUSTER_STATUS_AVAILABLE = "available";
export const FAILED_STATUSES = ["create-failed", "restore-failed", "incompatible-network"];
