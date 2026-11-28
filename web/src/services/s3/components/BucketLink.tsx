import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useBucketExists } from "../hooks/useBuckets.ts";
import { s3Routes } from "@localconsole/core/s3";

// Tên bucket thành link sang trang bucket; dùng ở origin của CloudFront
export function BucketLink({ name }: { name: string }) {
  const exists = useBucketExists(name).data;
  return <ReferenceLink name={name} href={s3Routes.bucket(name)} missing={exists === false} />;
}
