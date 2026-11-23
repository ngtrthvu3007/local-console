import CodeView from "@cloudscape-design/code-view/code-view";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import { CopyButton } from "@shared/components/CopyButton.tsx";

const COPY_CODE_LABEL = "Copy code";

// Khối JSON / text chỉ đọc, nút Copy dạng icon ở góc trên phải như thẻ Connect. Dòng dài tự xuống dòng
export function CodeBlock({ code, json = true }: { code: string; json?: boolean }) {
  return (
    <CodeView
      content={code}
      highlight={json ? jsonHighlight : undefined}
      wrapLines
      ariaLabel='Code'
      actions={<CopyButton variant='icon' text={code} label={COPY_CODE_LABEL} />}
    />
  );
}
