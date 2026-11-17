import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consoleApi, consoleConfig, elastiCache, uniqueName, waitFor } from "./helpers.ts";

// Cluster thật do Floci bật (container Redis/Valkey); console nói chuyện với nó qua /api/redis
const cluster = uniqueName("redis");
const api = `/api/redis/${cluster}`;
let region: string;

beforeAll(async () => {
  region = (await consoleConfig()).region;
  const created = await elastiCache(region, "CreateCacheCluster", {
    CacheClusterId: cluster,
    Engine: "redis",
    CacheNodeType: "cache.t3.micro",
    NumCacheNodes: "1",
  });
  expect(created.status, created.text).toBe(200);
  // Console trả 409 ClusterNotReady cho tới khi cluster có endpoint và Redis nhận lệnh
  await waitFor("Redis cluster to answer through the console", async () => {
    const info = await consoleApi("GET", `${api}/info`);
    return info.status === 200 ? info.body : undefined;
  });
});

afterAll(async () => {
  await elastiCache(region, "DeleteCacheCluster", { CacheClusterId: cluster });
});

describe("Redis through /api/redis", () => {
  it("reports the server it talks to", async () => {
    const { body } = await consoleApi("GET", `${api}/info`);
    expect(["redis", "valkey"]).toContain(body.engine);
    expect(body.version).toMatch(/^\d+\./);
  });

  it("creates a string with a TTL and reads it back", async () => {
    const created = await consoleApi("POST", `${api}/keys`, {
      body: { name: "session:1", type: "string", value: "hello", ttl: 600 },
    });
    expect(created).toEqual({ status: 201, body: { name: "session:1" } });
    const { body } = await consoleApi("GET", `${api}/key?name=session:1`);
    expect(body).toMatchObject({ kind: "string", value: "hello", length: 5 });
    expect(body.ttl).toBeGreaterThan(590);
  });

  it("refuses to create a key that already exists", async () => {
    const { status, body } = await consoleApi("POST", `${api}/keys`, {
      body: { name: "session:1", type: "string", value: "again", ttl: null },
    });
    expect(status).toBe(409);
    expect(body.code).toBe("AlreadyExists");
  });

  it("edits a hash field by field", async () => {
    await consoleApi("POST", `${api}/keys`, {
      body: { name: "user:1", type: "hash", field: "name", value: "Vu", ttl: null },
    });
    await consoleApi("PATCH", `${api}/key?name=user:1`, {
      body: { operation: "addField", field: "role", value: "dev" },
    });
    const { body } = await consoleApi("GET", `${api}/key?name=user:1`);
    expect(body.kind).toBe("hash");
    expect(body.items).toEqual(
      expect.arrayContaining([
        { field: "name", value: "Vu" },
        { field: "role", value: "dev" },
      ]),
    );
  });

  it("keeps sorted set scores as Redis text", async () => {
    await consoleApi("POST", `${api}/keys`, {
      body: { name: "board", type: "zset", value: "alice", score: 10, ttl: null },
    });
    await consoleApi("PATCH", `${api}/key?name=board`, {
      body: { operation: "addScoredMember", member: "bob", score: 2.5 },
    });
    const { body } = await consoleApi("GET", `${api}/key?name=board`);
    expect(body.items).toEqual([
      { member: "bob", score: "2.5" },
      { member: "alice", score: "10" },
    ]);
  });

  it("answers 409 WrongType when an edit does not match the key type", async () => {
    const { status, body } = await consoleApi("PATCH", `${api}/key?name=session:1`, {
      body: { operation: "addMembers", members: ["x"] },
    });
    expect(status).toBe(409);
    expect(body.code).toBe("WrongType");
  });

  it("lists keys by pattern and type, then deletes them", async () => {
    const hashes = await consoleApi("GET", `${api}/keys?pattern=user:*&type=hash`);
    expect(hashes.body.keys.map((key: { name: string }) => key.name)).toEqual(["user:1"]);
    const deleted = await consoleApi("POST", `${api}/keys/delete`, {
      body: { names: ["session:1", "user:1", "board"] },
    });
    expect(deleted.body).toEqual({ deleted: 3 });
  });

  it("answers 404 ClusterNotFound for an unknown cluster", async () => {
    const { status, body } = await consoleApi("GET", `/api/redis/${uniqueName("missing")}/keys`);
    expect(status).toBe(404);
    expect(body.code).toBe("ClusterNotFound");
  });

  it("validates the request body", async () => {
    // Hash phải có field: zod chặn trước khi tới Redis
    const { status, body } = await consoleApi("POST", `${api}/keys`, {
      body: { name: "bad", type: "hash", value: "x", ttl: null },
    });
    expect(status).toBe(400);
    expect(body.code).toBe("ValidationError");
  });
});
