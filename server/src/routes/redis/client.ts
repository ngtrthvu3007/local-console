import { randomUUID } from "node:crypto";
import {
  DescribeCacheClustersCommand,
  DescribeReplicationGroupsCommand,
  type ElastiCacheClient,
  type Endpoint,
} from "@aws-sdk/client-elasticache";
import { Redis } from "ioredis";
import {
  HTTP_BAD_GATEWAY,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
} from "../../constants.ts";
import { reachableHost } from "../../flociHost.ts";
import { HttpError } from "../../middleware/error.ts";
import {
  REDIS_ERROR_CODES,
  type CreateKeyInput,
  type KeyPage,
  type KeySummary,
  type KeyUpdate,
  type KeyValue,
  type RedisKeyType,
  type ServerInfo,
} from "./contract.ts";

// Không kết nối được thì báo lỗi sau 5 giây, không treo (spec chính, mục 7)
const CONNECT_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 5000;
const READY_STATUS = "ready";

const NOT_FOUND_FAULTS = new Set(["ReplicationGroupNotFoundFault", "CacheClusterNotFoundFault"]);
const MEMCACHED_ENGINE = "memcached";
const REDIS_ENGINE = "redis";

const UNSUPPORTED_REASONS = {
  clusterMode: "Viewing keys isn't supported for clusters with cluster mode on yet.",
  secured: "Viewing keys isn't supported for clusters with AUTH or TLS yet.",
  memcached: "Memcached clusters aren't supported.",
};

// Mỗi trang khoảng 50 key; quét tối đa 10.000 key mỗi request để không treo khi pattern hiếm khớp
const KEYS_PAGE_SIZE = 50;
const SCAN_BATCH_SIZE = 1000;
const SCAN_LIMIT_PER_REQUEST = 10_000;
const SCAN_DONE = "0";
const COLLECTION_PAGE_SIZE = 100;
// String lớn hơn mức này chỉ báo kích thước, không trả nội dung
const STRING_VALUE_MAX_BYTES = 1024 * 1024;

const TTL_NO_EXPIRY = -1;
const TTL_KEY_MISSING = -2;
const TYPE_NONE = "none";
const WRONG_TYPE_PREFIX = "WRONGTYPE";
// Lỗi Redis trả về cho một lệnh (khác lỗi kết nối). ioredis khai báo ReplyError là any,
// nên nhận diện theo tên
const REPLY_ERROR_NAME = "ReplyError";
const isReplyError = (error: unknown): error is Error =>
  error instanceof Error && error.name === REPLY_ERROR_NAME;

const INFO_LINE_SEPARATOR = "\r\n";
const INFO_FIELD_SEPARATOR = ":";

interface Address {
  host: string;
  port: number;
}

const ttlOrNull = (ttl: number) => (ttl === TTL_NO_EXPIRY ? null : ttl);
const nextCursor = (cursor: string) => (cursor === SCAN_DONE ? null : cursor);

// [a, 1, b, 2] → [[a, 1], [b, 2]]
function pairs(flat: string[]): [string, string][] {
  const result: [string, string][] = [];
  for (let position = 0; position < flat.length; position += 2) {
    result.push([flat[position], flat[position + 1]]);
  }
  return result;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
// Lưu lại chuỗi đã decode từ dữ liệu binary sẽ làm hỏng dữ liệu, nên binary trả null
function utf8OrNull(buffer: Buffer | null): string | null {
  if (!buffer) return null;
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    return null;
  }
}

const keyNotFound = (name: string) =>
  new HttpError(HTTP_NOT_FOUND, REDIS_ERROR_CODES.keyNotFound, `Key ${name} no longer exists`);
const alreadyExists = (message: string) =>
  new HttpError(HTTP_CONFLICT, REDIS_ERROR_CODES.alreadyExists, message);

export function createRedisConnector(elastiCache: ElastiCacheClient, flociUrl: string) {
  const connections = new Map<string, Redis>();

  async function orUndefinedWhenNotFound<T>(request: () => Promise<T>): Promise<T | undefined> {
    try {
      return await request();
    } catch (error) {
      if (NOT_FOUND_FAULTS.has((error as Error).name)) return undefined;
      throw error;
    }
  }

  const unsupported = (reason: string) =>
    new HttpError(HTTP_BAD_REQUEST, REDIS_ERROR_CODES.unsupportedCluster, reason);

  // Trình duyệt chỉ gửi tên cluster; địa chỉ luôn tra từ Floci, không nhận địa chỉ tùy ý
  async function addressOf(cluster: string): Promise<Address> {
    let endpoint: Endpoint | undefined;
    const groups = await orUndefinedWhenNotFound(() =>
      elastiCache.send(new DescribeReplicationGroupsCommand({ ReplicationGroupId: cluster })),
    );
    const group = groups?.ReplicationGroups?.[0];
    if (group) {
      if (group.ClusterEnabled) throw unsupported(UNSUPPORTED_REASONS.clusterMode);
      if (group.AuthTokenEnabled || group.TransitEncryptionEnabled || group.UserGroupIds?.length) {
        throw unsupported(UNSUPPORTED_REASONS.secured);
      }
      endpoint = group.NodeGroups?.[0]?.PrimaryEndpoint;
    } else {
      const clusters = await orUndefinedWhenNotFound(() =>
        elastiCache.send(
          new DescribeCacheClustersCommand({ CacheClusterId: cluster, ShowCacheNodeInfo: true }),
        ),
      );
      const node = clusters?.CacheClusters?.[0];
      if (!node) {
        throw new HttpError(
          HTTP_NOT_FOUND,
          REDIS_ERROR_CODES.clusterNotFound,
          `Cluster ${cluster} not found`,
        );
      }
      if (node.Engine === MEMCACHED_ENGINE) throw unsupported(UNSUPPORTED_REASONS.memcached);
      if (node.AuthTokenEnabled || node.TransitEncryptionEnabled) {
        throw unsupported(UNSUPPORTED_REASONS.secured);
      }
      endpoint = node.CacheNodes?.[0]?.Endpoint;
    }
    if (!endpoint?.Address || !endpoint.Port) {
      throw new HttpError(
        HTTP_CONFLICT,
        REDIS_ERROR_CODES.clusterNotReady,
        `Cluster ${cluster} has no endpoint yet`,
      );
    }
    return { host: reachableHost(endpoint.Address, flociUrl), port: endpoint.Port };
  }

  // Giữ một kết nối cho mỗi địa chỉ; mất kết nối thì bỏ, lần sau mở lại
  function connectionTo({ host, port }: Address): Redis {
    const address = `${host}:${port}`;
    const existing = connections.get(address);
    if (existing) return existing;
    const connection = new Redis({
      host,
      port,
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    // Lỗi kết nối đã trả về qua từng lệnh; nghe sự kiện để Node không coi là lỗi chưa xử lý
    connection.on("error", () => undefined);
    connection.on("end", () => connections.delete(address));
    connections.set(address, connection);
    return connection;
  }

  // Chạy lệnh trên cluster; lỗi của Redis thành lỗi HTTP có mã rõ ràng
  return async function withRedis<T>(
    cluster: string,
    run: (redis: Redis) => Promise<T>,
  ): Promise<T> {
    const redis = connectionTo(await addressOf(cluster));
    try {
      return await run(redis);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (isReplyError(error)) {
        if (error.message.startsWith(WRONG_TYPE_PREFIX)) {
          throw new HttpError(
            HTTP_CONFLICT,
            REDIS_ERROR_CODES.wrongType,
            "Key type changed. Reload the key.",
          );
        }
        throw new HttpError(HTTP_BAD_REQUEST, REDIS_ERROR_CODES.redisError, error.message);
      }
      if (redis.status !== READY_STATUS) {
        throw new HttpError(
          HTTP_BAD_GATEWAY,
          REDIS_ERROR_CODES.redisUnavailable,
          `Can't connect to ${cluster}: ${(error as Error).message}`,
        );
      }
      throw error;
    }
  };
}

export type WithRedis = ReturnType<typeof createRedisConnector>;

// ---------- Key ----------

export async function listKeys(
  redis: Redis,
  query: { pattern: string; type?: RedisKeyType; cursor: string },
): Promise<KeyPage> {
  const names: string[] = [];
  let cursor = query.cursor;
  let scanned = 0;
  do {
    const [next, batch] = query.type
      ? await redis.scan(
          cursor,
          "MATCH",
          query.pattern,
          "COUNT",
          SCAN_BATCH_SIZE,
          "TYPE",
          query.type,
        )
      : await redis.scan(cursor, "MATCH", query.pattern, "COUNT", SCAN_BATCH_SIZE);
    names.push(...batch);
    cursor = next;
    scanned += SCAN_BATCH_SIZE;
  } while (
    cursor !== SCAN_DONE &&
    names.length < KEYS_PAGE_SIZE &&
    scanned < SCAN_LIMIT_PER_REQUEST
  );

  const pipeline = redis.pipeline();
  for (const name of names) pipeline.type(name).ttl(name);
  const replies = (await pipeline.exec()) ?? [];
  const keys: KeySummary[] = [];
  names.forEach((name, position) => {
    const type = replies[position * 2]?.[1] as string;
    const ttl = replies[position * 2 + 1]?.[1] as number;
    // Key hết hạn hoặc bị xóa giữa lúc quét
    if (type === TYPE_NONE || ttl === TTL_KEY_MISSING) return;
    keys.push({ name, type, ttl: ttlOrNull(ttl) });
  });
  return { keys, cursor: nextCursor(cursor) };
}

export async function readKey(redis: Redis, name: string, cursor: string): Promise<KeyValue> {
  const [type, ttl] = await Promise.all([redis.type(name), redis.ttl(name)]);
  if (type === TYPE_NONE) throw keyNotFound(name);
  const base = { name, type, ttl: ttlOrNull(ttl) };
  const offset = Number(cursor);
  const lastOnPage = offset + COLLECTION_PAGE_SIZE - 1;
  const nextOffset = (length: number) =>
    offset + COLLECTION_PAGE_SIZE < length ? String(offset + COLLECTION_PAGE_SIZE) : null;

  switch (type) {
    case "string": {
      const length = await redis.strlen(name);
      const value =
        length > STRING_VALUE_MAX_BYTES ? null : utf8OrNull(await redis.getBuffer(name));
      return { ...base, kind: "string", length, value };
    }
    case "hash": {
      const [length, [next, flat]] = await Promise.all([
        redis.hlen(name),
        redis.hscan(name, cursor, "COUNT", COLLECTION_PAGE_SIZE),
      ]);
      const items = pairs(flat).map(([field, value]) => ({ field, value }));
      return { ...base, kind: "hash", length, items, cursor: nextCursor(next) };
    }
    case "list": {
      const [length, values] = await Promise.all([
        redis.llen(name),
        redis.lrange(name, offset, lastOnPage),
      ]);
      const items = values.map((value, position) => ({ index: offset + position, value }));
      return { ...base, kind: "list", length, items, cursor: nextOffset(length) };
    }
    case "set": {
      const [length, [next, items]] = await Promise.all([
        redis.scard(name),
        redis.sscan(name, cursor, "COUNT", COLLECTION_PAGE_SIZE),
      ]);
      return { ...base, kind: "set", length, items, cursor: nextCursor(next) };
    }
    case "zset": {
      const [length, flat] = await Promise.all([
        redis.zcard(name),
        redis.zrange(name, String(offset), String(lastOnPage), "WITHSCORES"),
      ]);
      const items = pairs(flat).map(([member, score]) => ({ member, score }));
      return { ...base, kind: "zset", length, items, cursor: nextOffset(length) };
    }
    default:
      return { ...base, kind: "unsupported" };
  }
}

export async function createKey(redis: Redis, input: CreateKeyInput) {
  if (await redis.exists(input.name)) throw alreadyExists("A key with this name already exists");
  const transaction = redis.multi();
  switch (input.type) {
    case "string":
      transaction.set(input.name, input.value);
      break;
    case "hash":
      transaction.hset(input.name, input.field!, input.value);
      break;
    case "list":
      transaction.rpush(input.name, input.value);
      break;
    case "set":
      transaction.sadd(input.name, input.value);
      break;
    case "zset":
      transaction.zadd(input.name, input.score!, input.value);
      break;
  }
  if (input.ttl) transaction.expire(input.name, input.ttl);
  await transaction.exec();
}

export async function updateKey(redis: Redis, name: string, update: KeyUpdate) {
  switch (update.operation) {
    case "setString":
      // Sửa giá trị không làm mất hạn mà BE đã đặt
      await redis.set(name, update.value, "KEEPTTL");
      return;
    case "addField":
      if (!(await redis.hsetnx(name, update.field, update.value))) {
        throw alreadyExists(`Field ${update.field} already exists`);
      }
      return;
    case "setField":
      await redis.hset(name, update.field, update.value);
      return;
    case "deleteFields":
      await redis.hdel(name, ...update.fields);
      return;
    case "push":
      if (update.end === "head") await redis.lpush(name, update.value);
      else await redis.rpush(name, update.value);
      return;
    case "setIndex":
      await redis.lset(name, update.index, update.value);
      return;
    case "deleteIndexes": {
      // Redis không xóa theo index: đánh dấu từng vị trí rồi xóa dấu, trong một transaction
      const marker = `__localconsole_deleted_${randomUUID()}__`;
      const transaction = redis.multi();
      for (const index of update.indexes) transaction.lset(name, index, marker);
      transaction.lrem(name, 0, marker);
      await transaction.exec();
      return;
    }
    case "addMembers":
      if (!(await redis.sadd(name, ...update.members))) {
        throw alreadyExists(`Member ${update.members[0]} already exists`);
      }
      return;
    case "deleteMembers":
      await redis.srem(name, ...update.members);
      return;
    case "addScoredMember":
      if (!(await redis.zadd(name, "NX", update.score, update.member))) {
        throw alreadyExists(`Member ${update.member} already exists`);
      }
      return;
    case "setScore":
      await redis.zadd(name, "XX", update.score, update.member);
      return;
    case "deleteScoredMembers":
      await redis.zrem(name, ...update.members);
      return;
  }
}

export async function setTtl(redis: Redis, name: string, seconds: number | null) {
  if (seconds === null) {
    // PERSIST trả 0 cả khi key không có hạn sẵn, nên kiểm tra key còn không riêng
    if (!(await redis.exists(name))) throw keyNotFound(name);
    await redis.persist(name);
    return;
  }
  if (!(await redis.expire(name, seconds))) throw keyNotFound(name);
}

export const deleteKeys = (redis: Redis, names: string[]) => redis.del(...names);

export const flushDatabase = (redis: Redis) => redis.flushdb();

// ---------- Server ----------

function parseInfo(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split(INFO_LINE_SEPARATOR)) {
    const separator = line.indexOf(INFO_FIELD_SEPARATOR);
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return fields;
}

export async function serverInfo(redis: Redis): Promise<ServerInfo> {
  const [text, keys] = await Promise.all([redis.info(), redis.dbsize()]);
  const fields = parseInfo(text);
  // Valkey ghi cả redis_version (để tương thích) lẫn valkey_version; Redis không có server_name
  return {
    engine: fields.server_name ?? REDIS_ENGINE,
    version: fields.valkey_version ?? fields.redis_version,
    memoryUsedBytes: Number(fields.used_memory),
    clients: Number(fields.connected_clients),
    keys,
    uptimeSeconds: Number(fields.uptime_in_seconds),
  };
}
