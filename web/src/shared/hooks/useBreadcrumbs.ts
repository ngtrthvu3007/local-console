import { useEffect } from "react";
import type { BreadcrumbGroupProps } from "@cloudscape-design/components/breadcrumb-group";
import { createStore } from "../store.ts";

const store = createStore<BreadcrumbGroupProps.Item[]>([]);

export const useBreadcrumbItems = store.use;

// Trang khai báo breadcrumb, Layout hiển thị
export function useBreadcrumbs(items: BreadcrumbGroupProps.Item[]) {
  // So theo nội dung vì mảng items được tạo mới mỗi lần render
  const signature = JSON.stringify(items);
  useEffect(() => {
    store.set(JSON.parse(signature));
    return () => store.set([]);
  }, [signature]);
}
