import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { COPY_TEXTS } from "../constants.ts";
import { BreakableText } from "./BreakableText.tsx";

interface Props {
  text?: string;
  label?: string;
  variant?: "button" | "icon" | "inline";
}

export function CopyButton({ text, label = COPY_TEXTS.copy, variant = "button" }: Props) {
  return (
    <CopyToClipboard
      variant={variant}
      textToCopy={text ?? ""}
      // Ô inline: ARN / URL dài xuống dòng sau dấu phân cách, chữ copy không đổi
      textToDisplay={variant === "inline" && text ? <BreakableText text={text} /> : undefined}
      copyButtonText={label}
      copySuccessText={COPY_TEXTS.copied}
      copyErrorText={COPY_TEXTS.failed}
      disabled={!text}
    />
  );
}

// Giá trị trong bảng chi tiết (ID, ARN, URL): hiện chữ kèm nút copy; trống thì NOT_AVAILABLE
export const copyable = (text?: string) =>
  text ? <CopyButton variant='inline' text={text} label={text} /> : NOT_AVAILABLE;
