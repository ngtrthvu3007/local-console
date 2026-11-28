import { describe, expect, it } from "vitest";
import { publishSmsSchema } from "#services/sns/schemas.ts";
import {
  smsForRegion,
  formatPhoneNumber,
  matchesSearch,
  smsInboxSchema,
} from "#services/sns/smsInbox.ts";

const REGION = "ap-southeast-1";
const base = {
  Id: "a",
  Region: REGION,
  PhoneNumber: "+84900000111",
  Message: "Your verification code is 123456",
  Timestamp: "2026-11-19T10:20:01.705209341Z",
};

describe("smsForRegion", () => {
  it("keeps this region only, newest first", () => {
    const messages = [
      base,
      { ...base, Id: "b", Timestamp: "2026-11-19T10:20:01.706209Z" },
      { ...base, Id: "c", Region: "us-east-1", Timestamp: "2026-11-19T11:00:00.000000Z" },
    ];

    expect(smsForRegion(messages, REGION).map((sms) => sms.Id)).toEqual(["b", "a"]);
  });

  it("orders by time, not by the text of 9-digit timestamps", () => {
    // So chuỗi sẽ xếp ".9Z" sau ".1000…Z", dù tin thứ hai muộn hơn
    const messages = [
      { ...base, Id: "early", Timestamp: "2026-11-19T10:20:01.9Z" },
      { ...base, Id: "late", Timestamp: "2026-11-19T10:20:02.100000000Z" },
    ];

    expect(smsForRegion(messages, REGION).map((sms) => sms.Id)).toEqual(["late", "early"]);
  });
});

describe("matchesSearch", () => {
  it("matches phone number and message without case", () => {
    expect(matchesSearch(base, "+84900")).toBe(true);
    expect(matchesSearch(base, "VERIFICATION")).toBe(true);
  });
  it("matches the phone number as shown on screen, with spaces", () => {
    expect(matchesSearch(base, "+84 900 000")).toBe(true);
  });
  it("does not match other text", () => {
    expect(matchesSearch(base, "zzz")).toBe(false);
  });
  it("keeps everything when search is empty", () => {
    expect(matchesSearch(base, "")).toBe(true);
  });
});

describe("formatPhoneNumber", () => {
  it("groups Vietnamese mobile numbers for display", () => {
    expect(formatPhoneNumber("+84900000111")).toBe("+84 900 000 111");
  });

  it("keeps other E.164 formats unchanged", () => {
    expect(formatPhoneNumber("+14155552671")).toBe("+14155552671");
  });
});

describe("smsInboxSchema", () => {
  it("accepts a message with a null Subject", () => {
    expect(() => smsInboxSchema.parse({ messages: [{ ...base, Subject: null }] })).not.toThrow();
  });
});

describe("publishSmsSchema", () => {
  const form = { phoneNumber: "+84900000111", message: "hi", type: "Transactional" as const };

  it("accepts an E.164 number", () => {
    expect(publishSmsSchema.safeParse(form).success).toBe(true);
  });
  it("rejects a number without + or with letters", () => {
    expect(publishSmsSchema.safeParse({ ...form, phoneNumber: "84900000111" }).success).toBe(false);
    expect(publishSmsSchema.safeParse({ ...form, phoneNumber: "+84abc" }).success).toBe(false);
  });
  it("rejects a blank message", () => {
    expect(publishSmsSchema.safeParse({ ...form, message: "   " }).success).toBe(false);
  });
});
