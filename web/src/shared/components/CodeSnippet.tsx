import CodeView, { type CodeViewProps } from "@cloudscape-design/code-view/code-view";
import { LOADING_PLACEHOLDER } from "../constants.ts";
import { CopyButton } from "./CopyButton.tsx";

const COPY_CODE_LABEL = "Copy code";
const CODE_LABEL = "Code";

// Mọi khối code của console: nút Copy dạng icon ở góc trên phải (như AWS Console), một kiểu duy nhất.
// wrap: dòng dài xuống dòng; không wrap thì cuộn ngang trong khung, trang không cuộn
export function CodeSnippet({
  code,
  wrap = false,
  highlight,
  ariaLabel = CODE_LABEL,
}: {
  code?: string;
  wrap?: boolean;
  highlight?: CodeViewProps["highlight"];
  ariaLabel?: string;
}) {
  return (
    <CodeView
      content={code ?? LOADING_PLACEHOLDER}
      highlight={highlight}
      wrapLines={wrap}
      ariaLabel={ariaLabel}
      actions={<CopyButton variant='icon' text={code} label={COPY_CODE_LABEL} />}
    />
  );
}
