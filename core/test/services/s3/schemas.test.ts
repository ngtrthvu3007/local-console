import { describe, expect, it } from "vitest";
import {
  createBucketSchema,
  metadataSchema,
  uploadEncryptionSchema,
} from "#services/s3/schemas.ts";

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

describe("createBucketSchema", () => {
  const base = { name: "lc-bucket", versioning: "Disabled", tags: [], tagsValid: true };

  it("defaults to SSE-S3 and takes a KMS key for SSE-KMS", () => {
    const arn = "arn:aws:kms:ap-southeast-1:000000000000:key/k1";
    expect(
      createBucketSchema.parse({ ...base, encryption: "sse-s3", kmsKeyId: "" }).encryption,
    ).toBe("sse-s3");
    expect(
      createBucketSchema.parse({ ...base, encryption: "sse-kms", kmsKeyId: arn }).kmsKeyId,
    ).toBe(arn);
    expect(
      createBucketSchema.safeParse({ ...base, encryption: "sse-kms", kmsKeyId: "k1" }).success,
    ).toBe(false);
  });
});

describe("uploadEncryptionSchema", () => {
  it("uses the bucket default unless a KMS key is chosen", () => {
    expect(
      uploadEncryptionSchema.parse({ encryption: "bucket-default", kmsKeyId: "" }).encryption,
    ).toBe("bucket-default");
    expect(
      uploadEncryptionSchema.safeParse({ encryption: "sse-kms", kmsKeyId: "k1" }).success,
    ).toBe(false);
  });
});
