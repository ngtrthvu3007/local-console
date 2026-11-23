import {
  HTML_PREVIEW_BACKGROUND,
  HTML_PREVIEW_BASE,
  HTML_PREVIEW_HEIGHT,
  HTML_PREVIEW_SANDBOX,
} from "../constants.ts";

// Iframe sandbox không đo được chiều cao nên cao cố định; nền luôn trắng vì mail viết cho nền trắng
const frameStyle = {
  width: "100%",
  height: HTML_PREVIEW_HEIGHT,
  border: "none",
  background: HTML_PREVIEW_BACKGROUND,
} as const;

// HTML do app tạo có thể chứa script: sandbox không có allow-scripts; link mở
// tab mới nhờ <base>
export function HtmlPreview({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      sandbox={HTML_PREVIEW_SANDBOX}
      srcDoc={HTML_PREVIEW_BASE + html}
      style={frameStyle}
    />
  );
}
