import { describe, expect, it } from "vitest";
import { McpQueryError, selectTools, TOOL_GROUPS } from "../../src/mcp/registry.ts";

const namesOf = (options: Parameters<typeof selectTools>[1]) =>
  selectTools(TOOL_GROUPS, options).map((tool) => tool.name);

describe("selectTools", () => {
  it("has every group except reset by default", () => {
    const names = namesOf({ readOnly: false });
    expect(names).toContain("floci_read_status");
    expect(names).toContain("sqs_delete_queue");
    expect(names).toContain("ses_read_email");
    expect(names).not.toContain("floci_reset_data");
  });

  it("keeps only the read tools of the chosen groups with readOnly", () => {
    expect(namesOf({ services: ["sqs"], readOnly: true })).toEqual([
      "sqs_read_queue",
      "sqs_peek_message",
    ]);
  });

  it("has the reset tool only when reset is named, and never with readOnly", () => {
    expect(namesOf({ services: ["reset"], readOnly: false })).toEqual(["floci_reset_data"]);
    expect(namesOf({ services: ["reset"], readOnly: true })).toEqual([]);
  });

  it("rejects an unknown group and lists the valid ones", () => {
    expect(() => namesOf({ services: ["sqs", "nope"], readOnly: false })).toThrow(McpQueryError);
    expect(() => namesOf({ services: ["nope"], readOnly: false })).toThrow(/nope.*sqs, ses/);
  });
});
