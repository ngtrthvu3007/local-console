import { kmsRoutes } from "@localconsole/core/kms";

export const kmsBaseCrumbs = [
  { text: "AWS KMS", href: kmsRoutes.keys },
  { text: "Customer managed keys", href: kmsRoutes.keys },
];

export const keyCrumbs = (key: string) => [
  ...kmsBaseCrumbs,
  { text: key, href: kmsRoutes.key(key) },
];
