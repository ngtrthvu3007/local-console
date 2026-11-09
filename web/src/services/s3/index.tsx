import { Navigate } from "react-router";
import type { ServiceDefinition } from "../../registry.ts";
import { useBuckets } from "./hooks/useBuckets.ts";
import { BucketDetail } from "./pages/BucketDetail.tsx";
import { BucketList } from "./pages/BucketList.tsx";
import { CreateBucket } from "./pages/CreateBucket.tsx";
import { ObjectDetail } from "./pages/ObjectDetail.tsx";
import { UploadPage } from "./pages/UploadPage.tsx";
import { S3_ROUTE_PATTERNS, S3_SERVICE_ID, s3Routes } from "./routes.ts";

export const s3Service: ServiceDefinition = {
  id: S3_SERVICE_ID,
  name: "S3",
  fullName: "Amazon S3",
  description: "Object storage: buckets, objects, versions and pre-signed URLs",
  iconPath: "/icons/s3.svg",
  navigation: [{ text: "Buckets", href: s3Routes.buckets }],
  quickLinks: [{ text: "Create bucket", href: s3Routes.createBucket }],
  routes: [
    { index: true, element: <Navigate to={s3Routes.buckets} replace /> },
    { path: S3_ROUTE_PATTERNS.buckets, element: <BucketList /> },
    { path: S3_ROUTE_PATTERNS.createBucket, element: <CreateBucket /> },
    { path: S3_ROUTE_PATTERNS.bucket, element: <BucketDetail /> },
    { path: S3_ROUTE_PATTERNS.upload, element: <UploadPage /> },
    { path: S3_ROUTE_PATTERNS.object, element: <ObjectDetail /> },
  ],
  useResourceCount: () => ({ count: useBuckets().data?.length, noun: "bucket" }),
};
