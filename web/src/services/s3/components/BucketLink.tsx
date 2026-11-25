import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useBucketExists } from "../hooks/useBuckets.ts";
import { s3Routes } from "../routes.ts";

// Tên bucket thành link sang trang bucket; dùng ở origin của CloudFront
export function BucketLink({ name }: { name: string }) {
  const follow = useFollow();
  const exists = useBucketExists(name).data;
  if (exists === false) return <MissingReference name={name} />;
  return (
    <Link href={s3Routes.bucket(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
