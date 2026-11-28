import { Navigate } from "react-router";
import { IconKey } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { KMS_ROUTE_PATTERNS, KMS_SERVICE_ID, kmsRoutes } from "@localconsole/core/kms";

export const kmsService: ServiceDefinition = {
  id: KMS_SERVICE_ID,
  name: "KMS",
  fullName: "AWS Key Management Service",
  description:
    "Keys and aliases: encrypt, decrypt, sign and verify, enable, disable, schedule deletion",
  icon: IconKey,
  category: "security",
  navigation: [
    { text: "Customer managed keys", href: kmsRoutes.keys },
    { text: "AWS managed keys", href: kmsRoutes.awsKeys },
  ],
  routes: [
    { index: true, element: <Navigate to={kmsRoutes.keys} replace /> },
    {
      path: KMS_ROUTE_PATTERNS.keys,
      ...lazyPage(() => import("./pages/KeyList.tsx"), "CustomerKeyList"),
    },
    {
      path: KMS_ROUTE_PATTERNS.awsKeys,
      ...lazyPage(() => import("./pages/KeyList.tsx"), "AwsKeyList"),
    },
    {
      path: KMS_ROUTE_PATTERNS.createKey,
      ...lazyPage(() => import("./pages/CreateKey.tsx"), "CreateKey"),
    },
    {
      path: KMS_ROUTE_PATTERNS.key,
      ...lazyPage(() => import("./pages/KeyDetail.tsx"), "KeyDetail"),
    },
  ],
};
