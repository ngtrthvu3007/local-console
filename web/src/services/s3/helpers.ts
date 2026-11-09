import type { Tag as S3Tag } from "@aws-sdk/client-s3";
import type { Tag } from "@shared/components/TagsModal.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import {
  IMAGE_CONTENT_TYPE_PREFIX,
  IMAGE_PREVIEW_MAX_BYTES,
  JSON_CONTENT_TYPE,
  JSON_FILE_EXTENSION,
  PATH_DELIMITER,
  TEXT_CONTENT_TYPE_PATTERN,
  TEXT_FILE_EXTENSIONS,
  TEXT_PREVIEW_MAX_BYTES,
} from "./constants.ts";

const EXTENSION_SEPARATOR = ".";
const ENCODED_DELIMITER = /%2F/g;

// Encode key cho URL nhưng giữ "/" để đường dẫn dễ đọc
const encodeKey = (key: string) =>
  encodeURIComponent(key).replace(ENCODED_DELIMITER, PATH_DELIMITER);

export const copySource = (bucket: string, key: string, versionId?: string) =>
  `${bucket}/${encodeKey(key)}${versionId ? `?versionId=${versionId}` : ""}`;

export const s3Uri = (bucket: string, key = "") => `s3://${bucket}/${key}`;
export const bucketArn = (bucket: string) => `arn:aws:s3:::${bucket}`;
export const objectUrl = (publicUrl: string, bucket: string, key: string) =>
  `${publicUrl}/${bucket}/${encodeKey(key)}`;

export const fileNameOf = (key: string) => key.split(PATH_DELIMITER).filter(Boolean).pop() ?? key;

export function extensionOf(key: string): string {
  const name = fileNameOf(key);
  return name.includes(EXTENSION_SEPARATOR)
    ? name.split(EXTENSION_SEPARATOR).pop()!.toLowerCase()
    : NOT_AVAILABLE;
}

export const asFolderKey = (key: string) =>
  key.endsWith(PATH_DELIMITER) ? key : `${key}${PATH_DELIMITER}`;
export const withoutTrailingDelimiter = (name: string) => name.replace(/\/$/, "");

// "images/2026/" → [{ name: "images", prefix: "images/" }, { name: "2026", prefix: "images/2026/" }]
export function prefixSegments(prefix: string) {
  const names = prefix.split(PATH_DELIMITER).filter(Boolean);
  return names.map((name, index) => ({
    name,
    prefix: names.slice(0, index + 1).join(PATH_DELIMITER) + PATH_DELIMITER,
  }));
}

export const toS3TagSet = (tags: Tag[]): S3Tag[] =>
  tags.map((tag) => ({ Key: tag.key, Value: tag.value }));
export const fromS3TagSet = (tagSet: S3Tag[] = []): Tag[] =>
  tagSet.map((tag) => ({ key: tag.Key!, value: tag.Value! }));

type PreviewKind = "text" | "json" | "image" | "none";

export function previewKind(key: string, contentType = "", size = 0): PreviewKind {
  const extension = extensionOf(key);
  if (contentType.startsWith(IMAGE_CONTENT_TYPE_PREFIX))
    return size <= IMAGE_PREVIEW_MAX_BYTES ? "image" : "none";
  const isText =
    TEXT_CONTENT_TYPE_PATTERN.test(contentType) || TEXT_FILE_EXTENSIONS.includes(extension);
  if (!isText || size > TEXT_PREVIEW_MAX_BYTES) return "none";
  return contentType.startsWith(JSON_CONTENT_TYPE) || extension === JSON_FILE_EXTENSION
    ? "json"
    : "text";
}
