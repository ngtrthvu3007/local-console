import {
  HTML_PREVIEW_BACKGROUND,
  HTML_PREVIEW_BASE,
  HTML_PREVIEW_HEIGHT,
  HTML_PREVIEW_SANDBOX,
} from "../constants.ts";

// Iframe sandbox không đo được chiều cao nội dung nên khung cao cố định, cuộn
// bên trong. Nền trắng cả khi console ở giao diện tối: mail viết cho nền trắng,
// nền trong suốt thì chữ đen chìm
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
