import { describe, expect, it } from "vitest";
import {
  describeLifecycleActions,
  lifecycleScope,
  toLifecycleRule,
} from "#services/s3/lifecycleRules.ts";
import type { LifecycleFormOutput } from "#services/s3/schemas.ts";

const form = (overrides: Partial<LifecycleFormOutput> = {}): LifecycleFormOutput => ({
  id: "cleanup",
  prefix: "tmp/",
  status: "Enabled",
  expireDays: undefined,
  noncurrentDays: undefined,
  abortDays: undefined,
  deleteExpiredMarkers: false,
  ...overrides,
});

describe("toLifecycleRule", () => {
  it("maps every action the form sets", () => {
    expect(toLifecycleRule(form({ expireDays: 30, noncurrentDays: 7, abortDays: 1 }))).toEqual({
      ID: "cleanup",
      Status: "Enabled",
      Filter: { Prefix: "tmp/" },
      Expiration: { Days: 30 },
      NoncurrentVersionExpiration: { NoncurrentDays: 7 },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    });
  });

  it("uses the delete-marker expiration when no expiry days are set", () => {
    expect(toLifecycleRule(form({ deleteExpiredMarkers: true })).Expiration).toEqual({
      ExpiredObjectDeleteMarker: true,
    });
  });

  it("prefers expiry days over delete markers, since S3 refuses both in one rule", () => {
    expect(toLifecycleRule(form({ expireDays: 5, deleteExpiredMarkers: true })).Expiration).toEqual(
      {
        Days: 5,
      },
    );
  });

  it("leaves unset actions out", () => {
    const rule = toLifecycleRule(form({ abortDays: 3 }));
    expect(rule.Expiration).toBeUndefined();
    expect(rule.NoncurrentVersionExpiration).toBeUndefined();
  });
});

describe("lifecycleScope", () => {
  it("shows the filter prefix, the legacy top-level prefix, or the whole bucket", () => {
    expect(lifecycleScope({ Status: "Enabled", Filter: { Prefix: "logs/" } })).toBe("logs/");
    // Rule cũ đặt Prefix ở ngoài Filter
    expect(lifecycleScope({ Status: "Enabled", Prefix: "old/" })).toBe("old/");
    expect(lifecycleScope({ Status: "Enabled", Filter: { Prefix: "" } })).toBe("Whole bucket");
  });
});

describe("describeLifecycleActions", () => {
  it("lists each action in words", () => {
    expect(
      describeLifecycleActions({
        Status: "Enabled",
        Expiration: { Days: 30 },
        NoncurrentVersionExpiration: { NoncurrentDays: 1 },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      }),
    ).toEqual([
      "Expire current versions after 30 days",
      "Delete noncurrent versions after 1 day",
      "Abort incomplete uploads after 7 days",
    ]);
  });

  it("describes the delete-marker cleanup", () => {
    expect(
      describeLifecycleActions({
        Status: "Enabled",
        Expiration: { ExpiredObjectDeleteMarker: true },
      }),
    ).toEqual(["Delete expired delete markers"]);
  });

  it("returns nothing for a rule without actions", () => {
    expect(describeLifecycleActions({ Status: "Enabled" })).toEqual([]);
  });
});
