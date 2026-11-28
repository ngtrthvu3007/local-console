import { useEffect, type ReactNode } from "react";
import { createStore } from "../store.ts";

interface SplitPanelContent {
  header: string;
  description?: ReactNode;
  body: ReactNode;
  onClose: () => void;
}

const store = createStore<SplitPanelContent | null>(null);

export const useSplitPanelContent = store.use;

// Trang khai báo panel, Layout hiển thị (AppLayout nằm ở Layout, trang render qua Outlet).
// null = không có panel. Rời trang thì gỡ panel.
export function useSplitPanel(content: SplitPanelContent | null) {
  // Cập nhật sau mọi render vì nội dung là element mới; không lặp vì Layout render lại không kéo trang theo
  useEffect(() => store.set(content));
  useEffect(() => () => store.set(null), []);
}
