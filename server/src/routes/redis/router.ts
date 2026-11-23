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
import {
  REDIS_KEY_TYPES,
  createKeyInputSchema,
  keyUpdateSchema,
  ttlInputSchema,
} from "./contract.ts";

// Sửa string tới 1 MB; JSON escape có thể làm body lớn hơn giá trị
const BODY_LIMIT = "4mb";
const DELETE_KEYS_MAX = 1000;
const ALL_KEYS_PATTERN = "*";
const START_CURSOR = "0";

const cursorSchema = z.string().regex(/^\d+$/).default(START_CURSOR);
const nameSchema = z.string().min(1);

const clusterParams = z.object({ cluster: nameSchema });

const keysQuery = z.object({
  pattern: z.string().min(1).default(ALL_KEYS_PATTERN),
  type: z.enum(REDIS_KEY_TYPES).optional(),
  cursor: cursorSchema,
});

const keyQuery = z.object({ name: nameSchema, cursor: cursorSchema });
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
    const input = createKeyInputSchema.parse(request.body);
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
    const update = keyUpdateSchema.parse(request.body);
    await withRedis(cluster, (redis) => updateKey(redis, name, update));
    response.json({ name });
  });

  router.put("/:cluster/key/ttl", async (request, response) => {
    const { cluster } = clusterParams.parse(request.params);
    const { name } = keyQuery.parse(request.query);
    const { seconds } = ttlInputSchema.parse(request.body);
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
