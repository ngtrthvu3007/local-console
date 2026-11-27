import { describe, expect, it } from "vitest";
import { createBusSchema, sendEventsSchema } from "#services/eventbridge/schemas.ts";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("createBusSchema", () => {
  const check = (name: string) => createBusSchema.safeParse({ name });

  it("accepts valid names", () => {
    expect(check("orders").success).toBe(true);
    expect(check("my.app_v2-prod").success).toBe(true);
  });

  it("rejects default, other characters and names over 256 characters", () => {
    expect(firstMessage(check("default"))).toMatch(/already exists/);
    expect(check("my bus").success).toBe(false);
    expect(check("a".repeat(257)).success).toBe(false);
    expect(check("a".repeat(256)).success).toBe(true);
  });
});

describe("sendEventsSchema", () => {
  const form = { bus: "default", source: "my.app", detailType: "Created", detail: '{"id": 1}' };

  it("accepts a JSON object detail", () => {
    expect(sendEventsSchema.safeParse(form).success).toBe(true);
  });

  it("rejects detail that is not a JSON object", () => {
    expect(sendEventsSchema.safeParse({ ...form, detail: "{not json" }).success).toBe(false);
    expect(firstMessage(sendEventsSchema.safeParse({ ...form, detail: "[1]" }))).toMatch(/object/);
    expect(sendEventsSchema.safeParse({ ...form, detail: "" }).success).toBe(false);
  });

  it("requires source and detail type", () => {
    expect(sendEventsSchema.safeParse({ ...form, source: " " }).success).toBe(false);
    expect(sendEventsSchema.safeParse({ ...form, detailType: "" }).success).toBe(false);
  });
});
