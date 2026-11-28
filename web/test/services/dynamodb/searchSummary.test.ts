import { describe, expect, it } from "vitest";
import type { FilterCondition, ItemSearch } from "../../../src/services/dynamodb/expressions.ts";
import type { IndexKeys } from "../../../src/services/dynamodb/hooks/useTables.ts";
import type { ItemPage } from "../../../src/services/dynamodb/hooks/useItems.ts";
import { resultSummary, searchSummary } from "../../../src/services/dynamodb/searchSummary.ts";

const keys: IndexKeys = {
  partitionKey: { name: "pk", type: "S" },
  sortKey: { name: "sk", type: "S" },
};

const filter = (overrides: Partial<FilterCondition> = {}): FilterCondition => ({
  attribute: "status",
  operator: "=",
  type: "S",
  value: "DONE",
  secondValue: "",
  ...overrides,
});

const search = (overrides: Partial<ItemSearch> = {}): ItemSearch => ({
  mode: "scan",
  partitionKeyValue: "",
  filters: [],
  descending: false,
  ...overrides,
});

describe("searchSummary", () => {
  it("names a scan on the table or on the index", () => {
    expect(searchSummary("orders", search(), keys)).toBe("Scan on orders");

    expect(searchSummary("orders", search({ indexName: "by-status" }), keys)).toBe(
      "Scan on by-status",
    );
  });

  it("reads back a query with sort key and order", () => {
    const query = search({
      mode: "query",
      partitionKeyValue: "user#1",
      sortKey: { operator: "begins_with", value: "order#", secondValue: "" },
      descending: true,
    });

    expect(searchSummary("orders", query, keys)).toBe(
      "Query on orders · pk = user#1 · sk begins with order# · descending",
    );
  });

  it("reads back a between sort key", () => {
    const query = search({
      mode: "query",
      partitionKeyValue: "a",
      sortKey: { operator: "between", value: "1", secondValue: "5" },
    });

    expect(searchSummary("orders", query, keys)).toBe(
      "Query on orders · pk = a · sk between 1 and 5",
    );
  });

  it("spells out a single filter", () => {
    expect(searchSummary("orders", search({ filters: [filter({ operator: "<>" })] }), keys)).toBe(
      "Scan on orders · status ≠ DONE",
    );

    expect(
      searchSummary("orders", search({ filters: [filter({ operator: "exists" })] }), keys),
    ).toBe("Scan on orders · status exists");
  });

  it("counts several filters instead of listing them", () => {
    expect(searchSummary("orders", search({ filters: [filter(), filter()] }), keys)).toBe(
      "Scan on orders · 2 filters",
    );
  });
});

describe("resultSummary", () => {
  const page = (count: number, scannedCount: number) => ({ count, scannedCount }) as ItemPage;

  it("adds up pages and mentions scanned items only when filters dropped some", () => {
    expect(resultSummary([page(5, 5), page(7, 7)])).toBe("12 returned");
    expect(resultSummary([page(5, 20), page(7, 30)])).toBe("12 returned, 50 scanned");
  });

  it("handles no pages", () => {
    expect(resultSummary([])).toBe("0 returned");
  });
});
