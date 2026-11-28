import { describe, expect, it } from "vitest";
import {
  isWholeNumberIn,
  jsonObjectText,
  optionalWholeNumber,
  wholeNumberIn,
} from "#shared/validation/schemas.ts";

describe("whole number fields", () => {
  it("rejects blank text instead of reading it as 0", () => {
    expect(isWholeNumberIn("", { min: 0 })).toBe(false);
    expect(isWholeNumberIn("1.5", { min: 0 })).toBe(false);
    expect(isWholeNumberIn("7", { min: 1, max: 7 })).toBe(true);
  });

  it("parses to a number and names the range and unit", () => {
    const seconds = wholeNumberIn({ min: 1, max: 60 }, "seconds");
    expect(seconds.parse(" 30 ")).toBe(30);

    expect(seconds.safeParse("61").error?.issues[0]?.message).toBe(
      "Enter a whole number from 1 to 60 seconds.",
    );
  });

  it("treats a blank optional field as unused", () => {
    const days = optionalWholeNumber({ min: 1 }, "days");
    expect(days.parse("")).toBeUndefined();
    expect(days.safeParse("0").success).toBe(false);
  });
});

describe("jsonObjectText", () => {
  it("accepts blank text and JSON objects only", () => {
    expect(jsonObjectText.safeParse("").success).toBe(true);
    expect(jsonObjectText.safeParse('{"a": 1}').success).toBe(true);
    expect(jsonObjectText.safeParse("[1]").success).toBe(false);

    expect(jsonObjectText.min(1, "Enter it.").safeParse("").error?.issues[0]?.message).toBe(
      "Enter it.",
    );
  });
});
