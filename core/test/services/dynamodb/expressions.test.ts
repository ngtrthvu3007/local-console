import { describe, expect, it } from "vitest";
import {
  buildSearchInput,
  type FilterCondition,
  type ItemSearch,
} from "#services/dynamodb/expressions.ts";
import type { IndexKeys } from "#services/dynamodb/keys.ts";

const keys: IndexKeys = {
  partitionKey: { name: "pk", type: "S" },
  sortKey: { name: "created", type: "N" },
};

const scan = (filters: FilterCondition[] = []): ItemSearch => ({
  mode: "scan",
  partitionKeyValue: "",
  filters,
  descending: false,
});

const filter = (overrides: Partial<FilterCondition>): FilterCondition => ({
  attribute: "status",
  operator: "=",
  type: "S",
  value: "",
  secondValue: "",
  ...overrides,
});

describe("buildSearchInput: scan", () => {
  it("scans the whole table without expressions when there is no filter", () => {
    expect(buildSearchInput("orders", scan(), keys)).toEqual({ TableName: "orders" });
  });

  it("scans an index when one is chosen", () => {
    expect(buildSearchInput("orders", { ...scan(), indexName: "by-status" }, keys)).toEqual({
      TableName: "orders",
      IndexName: "by-status",
    });
  });

  it("puts names and values behind placeholders, so reserved words like status work", () => {
    expect(buildSearchInput("orders", scan([filter({ value: "DONE" })]), keys)).toEqual({
      TableName: "orders",
      FilterExpression: "#filter0 = :filter0",
      ExpressionAttributeNames: { "#filter0": "status" },
      ExpressionAttributeValues: { ":filter0": { S: "DONE" } },
    });
  });

  it("joins several filters with AND and trims attribute names and numbers", () => {
    const input = buildSearchInput(
      "orders",
      scan([
        filter({ attribute: " total ", operator: ">=", type: "N", value: " 10 " }),
        filter({ attribute: "paid", type: "BOOL", value: "true" }),
      ]),
      keys,
    );

    expect(input.FilterExpression).toBe("#filter0 >= :filter0 AND #filter1 = :filter1");
    expect(input.ExpressionAttributeNames).toEqual({ "#filter0": "total", "#filter1": "paid" });

    expect(input.ExpressionAttributeValues).toEqual({
      ":filter0": { N: "10" },
      ":filter1": { BOOL: true },
    });
  });

  it("writes begins_with and contains as functions", () => {
    const input = buildSearchInput(
      "orders",
      scan([
        filter({ operator: "begins_with", value: "DO" }),
        filter({ operator: "contains", value: "N" }),
      ]),
      keys,
    );

    expect(input.FilterExpression).toBe(
      "begins_with(#filter0, :filter0) AND contains(#filter1, :filter1)",
    );
  });

  it("writes between with two values", () => {
    const input = buildSearchInput(
      "orders",
      scan([
        filter({
          attribute: "total",
          operator: "between",
          type: "N",
          value: "1",
          secondValue: "9",
        }),
      ]),
      keys,
    );

    expect(input.FilterExpression).toBe("#filter0 BETWEEN :filter0 AND :filter0end");

    expect(input.ExpressionAttributeValues).toEqual({
      ":filter0": { N: "1" },
      ":filter0end": { N: "9" },
    });
  });

  it("sends no value for exists and not exists", () => {
    const input = buildSearchInput(
      "orders",
      scan([
        filter({ operator: "exists" }),
        filter({ attribute: "deleted", operator: "not_exists" }),
      ]),
      keys,
    );

    expect(input.FilterExpression).toBe(
      "attribute_exists(#filter0) AND attribute_not_exists(#filter1)",
    );

    expect(input.ExpressionAttributeValues).toBeUndefined();
  });
});

describe("buildSearchInput: query", () => {
  const query = (overrides: Partial<ItemSearch> = {}): ItemSearch => ({
    mode: "query",
    partitionKeyValue: "user#1",
    filters: [],
    descending: false,
    ...overrides,
  });

  it("queries by partition key, ascending by default", () => {
    expect(buildSearchInput("orders", query(), keys)).toEqual({
      TableName: "orders",
      KeyConditionExpression: "#key0 = :key0",
      ScanIndexForward: true,
      ExpressionAttributeNames: { "#key0": "pk" },
      ExpressionAttributeValues: { ":key0": { S: "user#1" } },
    });
  });

  it("sorts descending when asked", () => {
    expect(buildSearchInput("orders", query({ descending: true }), keys)).toHaveProperty(
      "ScanIndexForward",
      false,
    );
  });

  it("adds the sort key condition, including between", () => {
    const input = buildSearchInput(
      "orders",
      query({ sortKey: { operator: "between", value: "100", secondValue: "200" } }),
      keys,
    );

    expect(input).toHaveProperty(
      "KeyConditionExpression",
      "#key0 = :key0 AND #key1 BETWEEN :key1 AND :key1end",
    );

    expect(input.ExpressionAttributeValues).toEqual({
      ":key0": { S: "user#1" },
      ":key1": { N: "100" },
      ":key1end": { N: "200" },
    });
  });

  it("writes begins_with on the sort key as a function", () => {
    const stringSortKey: IndexKeys = { ...keys, sortKey: { name: "sk", type: "S" } };

    const input = buildSearchInput(
      "orders",
      query({ sortKey: { operator: "begins_with", value: "order#", secondValue: "" } }),
      stringSortKey,
    );

    expect(input).toHaveProperty(
      "KeyConditionExpression",
      "#key0 = :key0 AND begins_with(#key1, :key1)",
    );
  });

  it("ignores an empty sort key value", () => {
    const input = buildSearchInput(
      "orders",
      query({ sortKey: { operator: "=", value: "  ", secondValue: "" } }),
      keys,
    );

    expect(input).toHaveProperty("KeyConditionExpression", "#key0 = :key0");
  });

  it("ignores a sort key condition when the table has no sort key", () => {
    const input = buildSearchInput(
      "orders",
      query({ sortKey: { operator: "=", value: "1", secondValue: "" } }),
      { partitionKey: keys.partitionKey },
    );

    expect(input).toHaveProperty("KeyConditionExpression", "#key0 = :key0");
  });

  it("decodes a binary partition key from base64", () => {
    const input = buildSearchInput("files", query({ partitionKeyValue: " aGk= " }), {
      partitionKey: { name: "id", type: "B" },
    });

    expect(input.ExpressionAttributeValues).toEqual({
      ":key0": { B: new TextEncoder().encode("hi") },
    });
  });

  it("keeps key and filter placeholders apart", () => {
    const input = buildSearchInput("orders", query({ filters: [filter({ value: "DONE" })] }), keys);
    expect(input.FilterExpression).toBe("#filter0 = :filter0");
    expect(input.ExpressionAttributeNames).toEqual({ "#filter0": "status", "#key0": "pk" });
  });
});
