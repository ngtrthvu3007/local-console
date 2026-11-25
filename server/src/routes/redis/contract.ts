// Hợp đồng API Redis giữa server và web (web import lại file này qua alias @server).
// Chỉ chứa type, schema zod và hằng số thuần, không import gì của Node.
import { z } from "zod";

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

interface HashEntry {
  field: string;
  value: string;
}

interface ListElement {
  index: number;
  value: string;
}

interface ScoredMember {
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

const nameSchema = z.string().min(1);
const textSchema = z.string(); // giá trị Redis được phép rỗng
const scoreSchema = z.number().finite();
const ttlSecondsSchema = z.number().int().positive();
const membersSchema = z.array(textSchema).min(1);
const indexSchema = z.number().int().nonnegative();

export const createKeyInputSchema = z
  .object({
    name: nameSchema,
    type: z.enum(REDIS_KEY_TYPES),
    value: textSchema, // string: giá trị; list/set/zset: phần tử đầu; hash: value của field đầu
    field: nameSchema.optional(), // hash
    score: scoreSchema.optional(), // sorted set
    ttl: ttlSecondsSchema.nullable(),
  })
  .refine((input) => input.type !== "hash" || input.field !== undefined, {
    path: ["field"],
    message: "A hash needs a field",
  })
  .refine((input) => input.type !== "zset" || input.score !== undefined, {
    path: ["score"],
    message: "A sorted set member needs a score",
  });

export type CreateKeyInput = z.infer<typeof createKeyInputSchema>;

export const keyUpdateSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("setString"), value: textSchema }),
  z.object({ operation: z.literal("addField"), field: textSchema, value: textSchema }),
  z.object({ operation: z.literal("setField"), field: textSchema, value: textSchema }),
  z.object({ operation: z.literal("deleteFields"), fields: membersSchema }),
  z.object({ operation: z.literal("push"), value: textSchema, end: z.enum(["head", "tail"]) }),
  z.object({ operation: z.literal("setIndex"), index: indexSchema, value: textSchema }),
  z.object({ operation: z.literal("deleteIndexes"), indexes: z.array(indexSchema).min(1) }),
  z.object({ operation: z.literal("addMembers"), members: membersSchema }),
  z.object({ operation: z.literal("deleteMembers"), members: membersSchema }),
  z.object({ operation: z.literal("addScoredMember"), member: textSchema, score: scoreSchema }),
  z.object({ operation: z.literal("setScore"), member: textSchema, score: scoreSchema }),
  z.object({ operation: z.literal("deleteScoredMembers"), members: membersSchema }),
]);

export type KeyUpdate = z.infer<typeof keyUpdateSchema>;

export const ttlInputSchema = z.object({ seconds: ttlSecondsSchema.nullable() }); // null = bỏ hạn
export type TtlInput = z.infer<typeof ttlInputSchema>;

export interface ServerInfo {
  engine: string; // "valkey" hoặc "redis"
  version: string;
  memoryUsedBytes: number;
  clients: number;
  keys: number;
  uptimeSeconds: number;
}
