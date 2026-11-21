import { describe, expect, it } from "vitest";
import { addEmailSchema } from "../../../src/services/ses/schemas.ts";

describe("addEmailSchema", () => {
  it("accepts an address and trims spaces", () => {
    expect(addEmailSchema.parse({ email: " noreply@app.local " })).toEqual({ email: "noreply@app.local" });
  });
  it("rejects text that is not an email", () => {
    expect(addEmailSchema.safeParse({ email: "noreply" }).success).toBe(false);
    expect(addEmailSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
