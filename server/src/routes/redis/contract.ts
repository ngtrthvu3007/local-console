// Hợp đồng API Redis giữa server và web (web import lại file này qua alias @server).
// Chỉ chứa type và hằng số thuần, không import gì của Node.

export const REDIS_KEY_TYPES = ["string", "hash", "list", "set", "zset"] as const;
export type RedisKeyType = (typeof REDIS_KEY_TYPES)[number];

export const REDIS_ERROR_CODES = {
  clusterNotFound: "ClusterNotFound",
  clusterNotReady: "ClusterNotReady",
  unsupportedCluster: "UnsupportedCluster",
  keyNotFound: "KeyNotFound",
  alreadyExists: "AlreadyExists",
  wrongType: "WrongType",
  redisError: "RedisError",
  redisUnavailable: "RedisUnavailable",
} as const;

export interface KeySummary {
  name: string;
  type: string; // kiểu Redis trả về, có thể là kiểu console chưa hỗ trợ (vd: stream)
  ttl: number | null; // giây; null = không hết hạn
}

export interface KeyPage {
  keys: KeySummary[];
  cursor: string | null; // null = đã quét hết DB
}

interface KeyBase {
  name: string;
  type: string;
  ttl: number | null;
}

export interface HashEntry {
  field: string;
  value: string;
}

export interface ListElement {
  index: number;
  value: string;
}

export interface ScoredMember {
  member: string;
  score: string; // giữ chuỗi gốc của Redis (có thể là "inf")
}

// Một trang giá trị của key. Collection có cursor để Load more; null = hết
export type KeyValue =
  | (KeyBase & { kind: "string"; length: number; value: string | null }) // null: binary hoặc quá lớn
  | (KeyBase & { kind: "hash"; length: number; items: HashEntry[]; cursor: string | null })
  | (KeyBase & { kind: "list"; length: number; items: ListElement[]; cursor: string | null })
  | (KeyBase & { kind: "set"; length: number; items: string[]; cursor: string | null })
  | (KeyBase & { kind: "zset"; length: number; items: ScoredMember[]; cursor: string | null })
  | (KeyBase & { kind: "unsupported" });

export interface CreateKeyInput {
  name: string;
  type: RedisKeyType;
  value: string; // string: giá trị; list/set/zset: phần tử đầu; hash: value của field đầu
  field?: string; // hash
  score?: number; // sorted set
  ttl: number | null;
}

export type KeyUpdate =
  | { operation: "setString"; value: string }
  | { operation: "addField"; field: string; value: string }
  | { operation: "setField"; field: string; value: string }
  | { operation: "deleteFields"; fields: string[] }
  | { operation: "push"; value: string; end: "head" | "tail" }
  | { operation: "setIndex"; index: number; value: string }
  | { operation: "deleteIndexes"; indexes: number[] }
  | { operation: "addMembers"; members: string[] }
  | { operation: "deleteMembers"; members: string[] }
  | { operation: "addScoredMember"; member: string; score: number }
  | { operation: "setScore"; member: string; score: number }
  | { operation: "deleteScoredMembers"; members: string[] };

export interface TtlInput {
  seconds: number | null; // null = bỏ hạn
}

export interface ServerInfo {
  engine: string; // "valkey" hoặc "redis"
  version: string;
  memoryUsedBytes: number;
  clients: number;
  keys: number;
  uptimeSeconds: number;
}
