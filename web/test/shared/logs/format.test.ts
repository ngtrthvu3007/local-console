import { describe, expect, it } from "vitest";
import { logMessageText } from "../../../src/shared/logs/format.ts";

describe("logMessageText", () => {
  it("keeps line breaks of a log message and drops trailing whitespace", () => {
    expect(logMessageText("a\r\nb\rc\n")).toBe("a\nb\nc");
    expect(logMessageText(undefined)).toBe("");
  });
});
