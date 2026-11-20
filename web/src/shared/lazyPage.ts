import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

// Trang tải lười: code (và SDK) của một service chỉ tải khi mở trang của nó,
// bundle chính nhẹ. Dùng:
//   { path, ...lazyPage(() => import("./pages/BucketList.tsx"), "BucketList") }
export const lazyPage = <Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
): Pick<RouteObject, "lazy"> => ({
  lazy: async () => ({ Component: (await load())[name] }),
});
