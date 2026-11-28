import { describe, expect, it } from "vitest";
import type { KeyValue } from "@server/routes/redis/contract.ts";
import { keySummary, ttlCell, typeLabel } from "../../../src/services/elasticache/keyText.ts";

describe("typeLabel", () => {
  it("names a sorted set in words and keeps types the console does not know", () => {
    expect(typeLabel("zset")).toBe("sorted set");
    expect(typeLabel("hash")).toBe("hash");
    expect(typeLabel("stream")).toBe("stream");
  });
});

describe("ttlCell", () => {
  it("shows a dash for keys that never expire", () => {
    expect(ttlCell(null)).toBe("—");
  });

  it("shows the remaining time", () => {
    expect(ttlCell(59 * 60 + 12)).toBe("59m 12s");
  });
});

describe("keySummary", () => {
  const base = { name: "k", ttl: null };

  it("describes a string by its size", () => {
    const value: KeyValue = { ...base, type: "string", kind: "string", length: 2048, value: "x" };
    expect(keySummary(value)).toBe("string · 2.0 KB · No expiry");
  });

  it("counts the entries of a collection", () => {
    const hash: KeyValue = {
      ...base,
      type: "hash",
      kind: "hash",
      length: 3,
      items: [],
      cursor: null,
    };

    const list: KeyValue = {
      ...base,
      type: "list",
      kind: "list",
      length: 1,
      items: [],
      cursor: null,
    };

    const zset: KeyValue = {
      ...base,
      ttl: 90,
      type: "zset",
      kind: "zset",
      length: 2,
      items: [],
      cursor: null,
    };

    expect(keySummary(hash)).toBe("hash · 3 fields · No expiry");
    expect(keySummary(list)).toBe("list · 1 element · No expiry");
    expect(keySummary(zset)).toBe("sorted set · 2 members · TTL 1m 30s");
  });

  it("skips the size for a type the console can't read", () => {
    const value: KeyValue = { ...base, type: "stream", kind: "unsupported" };
    expect(keySummary(value)).toBe("stream · No expiry");
  });
});
