import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDate,
  formatDuration,
  nounFor,
  pluralize,
} from "../../src/shared/format.ts";

describe("formatBytes", () => {
  it("shows a dash when the size is unknown", () => {
    expect(formatBytes(undefined)).toBe("—");
  });

  it("keeps whole bytes below 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("switches unit every 1024 with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("stops at TB instead of running out of units", () => {
    expect(formatBytes(2 * 1024 ** 5)).toBe("2048.0 TB");
  });
});

describe("formatDate", () => {
  it("prints YYYY-MM-DD HH:mm:ss in local time", () => {
    // Dựng theo giờ local để test không phụ thuộc múi giờ của máy chạy
    expect(formatDate(new Date(2026, 10, 16, 9, 5, 3))).toBe("2026-11-16 09:05:03");
  });

  it("shows a dash when there is no date", () => {
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("pluralize", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralize(1, "bucket")).toBe("1 bucket");
    expect(pluralize(0, "bucket")).toBe("0 buckets");
    expect(pluralize(2, "bucket")).toBe("2 buckets");
  });

  it("accepts an irregular plural", () => {
    expect(nounFor(2, "index", "indexes")).toBe("indexes");
    expect(pluralize(3, "index", "indexes")).toBe("3 indexes");
  });
});

describe("formatDuration", () => {
  it("shows seconds alone under a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("keeps only the two largest units", () => {
    expect(formatDuration(59 * 60 + 12)).toBe("59m 12s");
    expect(formatDuration(6 * 3600 + 30)).toBe("6h 0m");
    expect(formatDuration(3 * 86400 + 4 * 3600 + 59)).toBe("3d 4h");
  });
});
