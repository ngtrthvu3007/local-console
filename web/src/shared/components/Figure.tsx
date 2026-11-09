import type { ReactNode } from "react";
import Box from "@cloudscape-design/components/box";

// Chữ số đều nhau để cột số thẳng hàng
const figureStyle = { fontVariantNumeric: "tabular-nums" } as const;

// Cột số căn phải, cả header lẫn ô (Box đặt lại độ đậm, nên header phải đậm lại)
export const Figure = ({ children }: { children: ReactNode }) => (
  <Box textAlign='right'>
    <span style={figureStyle}>{children}</span>
  </Box>
);

export const FigureHeader = ({ children }: { children: ReactNode }) => (
  <Box textAlign='right' fontWeight='bold'>
    {children}
  </Box>
);
