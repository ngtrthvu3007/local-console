import express, { Router } from "express";
import { z } from "zod";
import { HTTP_CREATED } from "../../constants.ts";
import {
  createKey,
  deleteKeys,
  flushDatabase,
  listKeys,
  readKey,
  serverInfo,
  setTtl,
  updateKey,
  type WithRedis,
} from "./client.ts";
import { REDIS_KEY_TYPES, type CreateKeyInput, type KeyUpdate, type TtlInput } from "./contract.ts";

// Sửa string tới 1 MB; JSON escape có thể làm body lớn hơn giá trị
const BODY_LIMIT = "4mb";
const DELETE_KEYS_MAX = 1000;
const ALL_KEYS_PATTERN = "*";
const START_CURSOR = "0";

const cursorSchema = z.string().regex(/^\d+$/).default(START_CURSOR);
const nameSchema = z.string().min(1);
const textSchema = z.string(); // giá trị Redis được phép rỗng
const scoreSchema = z.number().finite();
const ttlSecondsSchema = z.number().int().positive();

const clusterParams = z.object({ cluster: nameSchema });
const keysQuery = z.object({
  pattern: z.string().min(1).default(ALL_KEYS_PATTERN),
  type: z.enum(REDIS_KEY_TYPES).optional(),
  cursor: cursorSchema,
});
const keyQuery = z.object({ name: nameSchema, cursor: cursorSchema });

const createKeySchema = z
  .object({
    name: nameSchema,
    type: z.enum(REDIS_KEY_TYPES),
    value: textSchema,
    field: nameSchema.optional(),
    score: scoreSchema.optional(),
    ttl: ttlSecondsSchema.nullable(),
  })
  .refine((input) => input.type !== "hash" || input.field !== undefined, {
    path: ["field"],
    message: "A hash needs a field",
  })
  .refine((input) => input.type !== "zset" || input.score !== undefined, {
    path: ["score"],
    message: "A sorted set member needs a score",
  }) satisfies z.ZodType<CreateKeyInput>;

const membersSchema = z.array(textSchema).min(1);
const updateSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("setString"), value: textSchema }),
  z.object({ operation: z.literal("addField"), field: textSchema, value: textSchema }),
  z.object({ operation: z.literal("setField"), field: textSchema, value: textSchema }),
  z.object({ operation: z.literal("deleteFields"), fields: membersSchema }),
  z.object({ operation: z.literal("push"), value: textSchema, end: z.enum(["head", "tail"]) }),
  z.object({
    operation: z.literal("setIndex"),
    index: z.number().int().nonnegative(),
    value: textSchema,
  }),
  z.object({
    operation: z.literal("deleteIndexes"),
    indexes: z.array(z.number().int().nonnegative()).min(1),
  }),
  z.object({ operation: z.literal("addMembers"), members: membersSchema }),
  z.object({ operation: z.literal("deleteMembers"), members: membersSchema }),
  z.object({ operation: z.literal("addScoredMember"), member: textSchema, score: scoreSchema }),
  z.object({ operation: z.literal("setScore"), member: textSchema, score: scoreSchema }),
  z.object({ operation: z.literal("deleteScoredMembers"), members: membersSchema }),
]) satisfies z.ZodType<KeyUpdate>;

const ttlSchema = z.object({
  seconds: ttlSecondsSchema.nullable(),
}) satisfies z.ZodType<TtlInput>;
const deleteKeysSchema = z.object({ names: z.array(nameSchema).min(1).max(DELETE_KEYS_MAX) });

// Cầu nối dữ liệu Redis: trình duyệt không mở được kết nối TCP tới Redis
export function redisRouter(withRedis: WithRedis): Router {
  const router = Router();
  router.use(express.json({ limit: BODY_LIMIT }));

  router.get("/:cluster/keys", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const query = keysQuery.parse(request.query);
    response.json(await withRedis(cluster, (redis) => listKeys(redis, query)));
  });

  router.post("/:cluster/keys", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const input = createKeySchema.parse(request.body);
    await withRedis(cluster, (redis) => createKey(redis, input));
    response.status(HTTP_CREATED).json({ name: input.name });
  });

  router.post("/:cluster/keys/delete", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const { names } = deleteKeysSchema.parse(request.body);
    const deleted = await withRedis(cluster, (redis) => deleteKeys(redis, names));
    response.json({ deleted });
  });

  router.get("/:cluster/key", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const { name, cursor } = keyQuery.parse(request.query);
    response.json(await withRedis(cluster, (redis) => readKey(redis, name, cursor)));
  });

  router.patch("/:cluster/key", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const { name } = keyQuery.parse(request.query);
    const update = updateSchema.parse(request.body);
    await withRedis(cluster, (redis) => updateKey(redis, name, update));
    response.json({ name });
  });

  router.put("/:cluster/key/ttl", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const { name } = keyQuery.parse(request.query);
    const { seconds } = ttlSchema.parse(request.body);
    await withRedis(cluster, (redis) => setTtl(redis, name, seconds));
    response.json({ name, ttl: seconds });
  });

  router.post("/:cluster/flush", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    await withRedis(cluster, flushDatabase);
    response.json({ flushed: true });
  });

  router.get("/:cluster/info", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    response.json(await withRedis(cluster, serverInfo));
  });

  return router;
}
