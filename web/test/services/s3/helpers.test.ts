import { describe, expect, it } from "vitest";
import {
  asFolderKey,
  bucketArn,
  copySource,
  extensionOf,
  fileNameOf,
  fromS3TagSet,
  objectUrl,
  prefixSegments,
  previewKind,
  s3Uri,
  toS3TagSet,
  withoutTrailingDelimiter,
} from "../../../src/services/s3/helpers.ts";

const MIB = 1024 * 1024;

describe("URLs and identifiers", () => {
  it("encodes keys but keeps / readable", () => {
    expect(copySource("photos", "2026/ảnh mới.png")).toBe(
      "photos/2026/%E1%BA%A3nh%20m%E1%BB%9Bi.png",
    );
    expect(objectUrl("http://localhost:4566", "photos", "a b/c.txt")).toBe(
      "http://localhost:4566/photos/a%20b/c.txt",
    );
  });

  it("adds the version to a copy source", () => {
    expect(copySource("photos", "a.png", "v1")).toBe("photos/a.png?versionId=v1");
  });

  it("builds the S3 URI and the bucket ARN", () => {
    expect(s3Uri("photos")).toBe("s3://photos/");
    expect(s3Uri("photos", "a/b.png")).toBe("s3://photos/a/b.png");
    expect(bucketArn("photos")).toBe("arn:aws:s3:::photos");
  });
});

describe("key names", () => {
  it("takes the last segment as the file name, also for folders", () => {
    expect(fileNameOf("a/b/c.txt")).toBe("c.txt");
    expect(fileNameOf("a/b/")).toBe("b");
  });

  it("returns the lowercase extension, or a dash when there is none", () => {
    expect(extensionOf("docs/Report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("Makefile")).toBe("—");
  });

  it("adds or removes the trailing slash of a folder", () => {
    expect(asFolderKey("a/b")).toBe("a/b/");
    expect(asFolderKey("a/b/")).toBe("a/b/");
    expect(withoutTrailingDelimiter("b/")).toBe("b");
    expect(withoutTrailingDelimiter("b")).toBe("b");
  });

  it("splits a prefix into breadcrumb segments", () => {
    expect(prefixSegments("images/2026/")).toEqual([
      { name: "images", prefix: "images/" },
      { name: "2026", prefix: "images/2026/" },
    ]);
    expect(prefixSegments("")).toEqual([]);
  });
});

describe("tags", () => {
  it("converts between console tags and S3 tags both ways", () => {
    const tags = [{ key: "env", value: "dev" }];
    expect(toS3TagSet(tags)).toEqual([{ Key: "env", Value: "dev" }]);
    expect(fromS3TagSet(toS3TagSet(tags))).toEqual(tags);
    expect(fromS3TagSet(undefined)).toEqual([]);
  });
});

describe("previewKind", () => {
  it("previews images up to 10 MiB", () => {
    expect(previewKind("a.png", "image/png", 10 * MIB)).toBe("image");
    expect(previewKind("a.png", "image/png", 10 * MIB + 1)).toBe("none");
  });

  it("previews JSON by content type or by extension", () => {
    expect(previewKind("data", "application/json", 10)).toBe("json");
    expect(previewKind("data.json", "binary/octet-stream", 10)).toBe("json");
  });

  it("previews text by content type or by extension", () => {
    expect(previewKind("notes", "text/plain", 10)).toBe("text");
    expect(previewKind("README.md", "", 10)).toBe("text");
  });

  it("does not preview text over 1 MiB", () => {
    expect(previewKind("big.txt", "text/plain", MIB + 1)).toBe("none");
  });

  it("does not preview other files", () => {
    expect(previewKind("app.zip", "application/zip", 10)).toBe("none");
  });
});
