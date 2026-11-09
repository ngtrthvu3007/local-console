import { useEffect, type ReactNode } from "react";
import { createStore } from "../store.ts";

export interface SplitPanelContent {
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
  // Nội dung là element mới mỗi lần render, nên cập nhật sau mọi lần render.
  // Layout render lại không làm trang render lại (Outlet giữ nguyên element), nên không lặp.
  useEffect(() => store.set(content));
  useEffect(() => () => store.set(null), []);
}
