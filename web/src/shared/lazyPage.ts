import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

// Code + SDK của service chỉ tải khi mở trang, giữ bundle chính nhẹ
//   { path, ...lazyPage(() => import("./pages/BucketList.tsx"), "BucketList") }
export const lazyPage = <Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
): Pick<RouteObject, "lazy"> => ({
  lazy: async () => ({ Component: (await load())[name] }),
});
