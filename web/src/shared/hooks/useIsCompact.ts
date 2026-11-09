import { useCallback, useState } from "react";
import { COMPACT_WIDTH_PX } from "../constants.ts";

// Đo bề ngang của khung (không phải màn hình), vì sidebar mở/đóng cũng làm khung hẹp lại.
// Dùng callback ref: phần tử có thể mount muộn (vd: sau spinner), lúc đó mới bắt đầu đo.
// maxWidth: ngưỡng riêng khi một khối cần đổi bố cục ở độ rộng khác (mặc định COMPACT_WIDTH_PX)
export function useIsCompact(maxWidth = COMPACT_WIDTH_PX) {
  const [compact, setCompact] = useState(false);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const observer = new ResizeObserver(([entry]) =>
        setCompact(entry.contentRect.width < maxWidth),
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
    [maxWidth],
  );

  return { ref, compact };
}
