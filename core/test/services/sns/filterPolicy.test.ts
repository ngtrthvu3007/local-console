import { describe, expect, it } from "vitest";
import { filterPolicyError, summarizeFilterPolicy } from "#services/sns/filterPolicy.ts";

describe("summarizeFilterPolicy", () => {
  it("shows no filter as a dash", () => {
    expect(summarizeFilterPolicy(undefined)).toBe("—");
    expect(summarizeFilterPolicy("")).toBe("—");
  });

  it("writes each key as key = values", () => {
    expect(summarizeFilterPolicy('{"type": ["order"]}')).toBe("type = order");
    expect(summarizeFilterPolicy('{"type": ["order"], "region": ["us", "eu"]}')).toBe(
      "type = order, region = us | eu",
    );
  });

  it("keeps operators readable", () => {
    expect(summarizeFilterPolicy('{"name": [{"prefix": "a"}]}')).toBe('name = {"prefix":"a"}');
  });

  it("cuts long policies and returns broken JSON as is", () => {
    const long = JSON.stringify({ attribute: ["a".repeat(80)] });
    expect(summarizeFilterPolicy(long)).toMatch(/…$/);
    expect(summarizeFilterPolicy("{oops")).toBe("{oops");
  });
});

describe("filterPolicyError", () => {
  it("accepts empty text (no filter) and a JSON object", () => {
    expect(filterPolicyError("")).toBeUndefined();
    expect(filterPolicyError("  ")).toBeUndefined();
    expect(filterPolicyError('{"type": ["order"]}')).toBeUndefined();
  });

  it("rejects broken JSON and non-objects", () => {
    expect(filterPolicyError("{oops")).toMatch(/Invalid JSON/);
    expect(filterPolicyError('["a"]')).toMatch(/JSON object/);
    expect(filterPolicyError("42")).toMatch(/JSON object/);
  });
});
