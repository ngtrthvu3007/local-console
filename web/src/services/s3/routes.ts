import { prefixSegments, s3Routes } from "@localconsole/core/s3";

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
