import { Navigate } from "react-router";
import { IconBucket } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { S3_ROUTE_PATTERNS, S3_SERVICE_ID, s3Routes } from "./routes.ts";

export const s3Service: ServiceDefinition = {
  id: S3_SERVICE_ID,
  name: "S3",
  fullName: "Amazon S3",
  description: "Object storage: buckets, objects, versions and pre-signed URLs",
  icon: IconBucket,
  category: "storage",
  navigation: [{ text: "Buckets", href: s3Routes.buckets }],
  routes: [
    { index: true, element: <Navigate to={s3Routes.buckets} replace /> },
    {
      path: S3_ROUTE_PATTERNS.buckets,
      ...lazyPage(() => import("./pages/BucketList.tsx"), "BucketList"),
    },
    {
      path: S3_ROUTE_PATTERNS.createBucket,
      ...lazyPage(() => import("./pages/CreateBucket.tsx"), "CreateBucket"),
    },
    {
      path: S3_ROUTE_PATTERNS.bucket,
      ...lazyPage(() => import("./pages/BucketDetail.tsx"), "BucketDetail"),
    },
    {
      path: S3_ROUTE_PATTERNS.upload,
      ...lazyPage(() => import("./pages/UploadPage.tsx"), "UploadPage"),
    },
    {
      path: S3_ROUTE_PATTERNS.object,
      ...lazyPage(() => import("./pages/ObjectDetail.tsx"), "ObjectDetail"),
    },
  ],
};
