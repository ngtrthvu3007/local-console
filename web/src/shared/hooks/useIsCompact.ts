import { useCallback, useState } from "react";
import { COMPACT_WIDTH_PX } from "../constants.ts";

// Đo khung chứ không đo màn hình: sidebar mở cũng làm khung hẹp. Callback ref vì phần tử có thể mount muộn
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
