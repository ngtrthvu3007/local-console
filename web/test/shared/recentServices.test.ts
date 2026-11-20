import { describe, expect, it } from "vitest";
import {
  matchServices,
  parseRecent,
  pushRecent,
  serviceIdFromPath,
} from "../../src/shared/recentServices.ts";

const ids = ["s3", "sqs", "ses", "lambda", "sns"];

describe("serviceIdFromPath", () => {
  it("takes the first segment when it is a service id", () => {
    expect(serviceIdFromPath("/sqs/queues/a", ids)).toBe("sqs");
    expect(serviceIdFromPath("/sqs", ids)).toBe("sqs");
  });

  it("ignores Home and paths that only look like a service", () => {
    expect(serviceIdFromPath("/", ids)).toBeUndefined();
    expect(serviceIdFromPath("/s3x/foo", ids)).toBeUndefined();
  });
});

describe("pushRecent", () => {
  it("moves a visited service to the front without duplicates", () => {
    expect(pushRecent(["s3", "sqs"], "sqs")).toEqual(["sqs", "s3"]);
  });

  it("keeps only the newest entries", () => {
    expect(pushRecent(["a", "b", "c", "d"], "e")).toEqual(["e", "a", "b", "c"]);
  });
});

describe("parseRecent", () => {
  it("keeps only ids still in the registry", () => {
    expect(parseRecent('["sqs","gone",1]', ids)).toEqual(["sqs"]);
  });

  it("treats broken or missing storage as empty", () => {
    expect(parseRecent("{bad", ids)).toEqual([]);
    expect(parseRecent('{"a":1}', ids)).toEqual([]);
    expect(parseRecent(null, ids)).toEqual([]);
  });
});

describe("matchServices", () => {
  const items = [
    { name: "SQS", fullName: "Amazon SQS" },
    { name: "SES", fullName: "Amazon SES" },
  ];

  it("matches name or full name, trimmed and case-insensitive", () => {
    expect(matchServices(items, " sq ")).toEqual([items[0]]);
    expect(matchServices(items, "amazon")).toEqual(items);
  });

  it("returns everything for empty text", () => {
    expect(matchServices(items, "")).toEqual(items);
  });
});
