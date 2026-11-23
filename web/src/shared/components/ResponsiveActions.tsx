import type { ReactNode } from "react";
import "./ResponsiveActions.css";

// Cho footer của form và nút trên header; vẫn dùng nút và focus ring của Cloudscape
// toolbar: trên phone, cụm nút dồn về mép phải của header.
export function ResponsiveActions({
  children,
  footer = false,
  toolbar = false,
}: {
  children: ReactNode;
  footer?: boolean;
  toolbar?: boolean;
}) {
  const className = [
    "console-actions",
    footer && "console-actions--footer",
    toolbar && "console-actions--toolbar",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={className}>{children}</div>;
}
