import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { COPY_TEXTS, NOT_AVAILABLE } from "../constants.ts";

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
