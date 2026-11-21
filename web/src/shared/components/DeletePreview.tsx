import type { ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import { DELETE_PREVIEW_COUNT } from "../constants.ts";

// Modal xóa hàng loạt chỉ liệt kê vài mục đầu, phần còn lại gom thành "…and N more"
export function DeletePreview({ lines }: { lines: ReactNode[] }) {
  const hiddenCount = lines.length - DELETE_PREVIEW_COUNT;
  return (
    <Box>
      {lines.slice(0, DELETE_PREVIEW_COUNT).map((line, index) => (
        <div key={index}>{line}</div>
      ))}
      {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
    </Box>
  );
}
