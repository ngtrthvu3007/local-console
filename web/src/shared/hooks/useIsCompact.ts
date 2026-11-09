import { useCallback, useState } from "react";
import { COMPACT_WIDTH_PX } from "../constants.ts";

// Đo bề ngang của khung (không phải màn hình), vì sidebar mở/đóng cũng làm khung hẹp lại.
// Dùng callback ref: phần tử có thể mount muộn (vd: sau spinner), lúc đó mới bắt đầu đo.
export function useIsCompact() {
  const [compact, setCompact] = useState(false);

  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setCompact(entry.contentRect.width < COMPACT_WIDTH_PX),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, compact };
}
