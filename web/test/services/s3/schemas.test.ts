import { describe, expect, it } from "vitest";
import { metadataSchema } from "../../../src/services/s3/schemas.ts";

// Metadata đi trong header HTTP: chữ Việt làm trình duyệt ném lỗi trước khi gửi request
describe("metadataSchema", () => {
  const parse = (key: string, value: string) =>
    metadataSchema.safeParse({ contentType: "text/plain", entries: [{ key, value }] }).success;

  it("accepts ASCII keys and values", () => {
    expect(parse("owner", "Nguyen Van A")).toBe(true);
  });

  it("rejects non-ASCII values and keys that are not header tokens", () => {
    expect(parse("owner", "Nguyễn Văn A")).toBe(false);
    expect(parse("my key", "x")).toBe(false);
  });
});
