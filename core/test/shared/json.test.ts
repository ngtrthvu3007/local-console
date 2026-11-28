import { describe, expect, it } from "vitest";
import { jsonError, prettyJson, reformatJson } from "#shared/utils/json.ts";

describe("jsonError", () => {
  it("accepts blank text, so an empty editor is not an error", () => {
    expect(jsonError("")).toBeUndefined();
    expect(jsonError("   \n")).toBeUndefined();
  });

  it("accepts valid JSON", () => {
    expect(jsonError('{"a": [1, 2]}')).toBeUndefined();
  });

  it("explains invalid JSON", () => {
    expect(jsonError("{a:1}")).toMatch(/^Invalid JSON: /);
  });
});

describe("reformatJson", () => {
  it("pretty-prints one-line JSON with two spaces", () => {
    expect(reformatJson('{"a":{"b":1}}')).toBe(prettyJson({ a: { b: 1 } }));
    expect(reformatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("returns text that is not JSON unchanged", () => {
    expect(reformatJson("not json")).toBe("not json");
  });
});
