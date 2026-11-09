import { generatePath } from "react-router";
import { prefixSegments } from "./helpers.ts";

export const S3_SERVICE_ID = "s3";
const S3_ROOT = `/${S3_SERVICE_ID}`;

export const BUCKET_TABS = {
  objects: "objects",
  properties: "properties",
  permissions: "permissions",
} as const;
export type BucketTab = (typeof BUCKET_TABS)[keyof typeof BUCKET_TABS];

export const SEARCH_PARAMS = { tab: "tab", prefix: "prefix", key: "key" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const S3_ROUTE_PATTERNS = {
  buckets: "buckets",
  createBucket: "buckets/create",
  bucket: "buckets/:bucket",
  upload: "buckets/:bucket/upload",
  object: "buckets/:bucket/object",
} as const;

const fullPath = (pattern: string) => `${S3_ROOT}/${pattern}`;
// generatePath tự encode tên bucket
const bucketPath = (pattern: string, bucket: string) => generatePath(fullPath(pattern), { bucket });

const withParams = (path: string, params: Record<string, string | undefined>) => {
  const defined = Object.entries(params).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );
  return defined.length ? `${path}?${new URLSearchParams(defined)}` : path;
};

export const s3Routes = {
  buckets: fullPath(S3_ROUTE_PATTERNS.buckets),
  createBucket: fullPath(S3_ROUTE_PATTERNS.createBucket),
  bucket: (bucket: string, options: { tab?: BucketTab; prefix?: string } = {}) =>
    withParams(bucketPath(S3_ROUTE_PATTERNS.bucket, bucket), {
      [SEARCH_PARAMS.tab]: options.tab,
      [SEARCH_PARAMS.prefix]: options.prefix,
    }),
  upload: (bucket: string, prefix?: string) =>
    withParams(bucketPath(S3_ROUTE_PATTERNS.upload, bucket), { [SEARCH_PARAMS.prefix]: prefix }),
  object: (bucket: string, key: string) =>
    withParams(bucketPath(S3_ROUTE_PATTERNS.object, bucket), { [SEARCH_PARAMS.key]: key }),
};

export const s3BaseCrumbs = [
  { text: "Amazon S3", href: s3Routes.buckets },
  { text: "Buckets", href: s3Routes.buckets },
];

// Amazon S3 > Buckets > my-bucket > images > 2026
export const bucketCrumbs = (bucket: string, prefix = "") => [
  ...s3BaseCrumbs,
  { text: bucket, href: s3Routes.bucket(bucket) },
  ...prefixSegments(prefix).map((segment) => ({
    text: segment.name,
    href: s3Routes.bucket(bucket, { prefix: segment.prefix }),
  })),
];
