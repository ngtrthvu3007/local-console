import { Fragment } from "react";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { NOT_AVAILABLE, identifierParts } from "@localconsole/core/shared";
import { COPY_TEXTS } from "../constants.ts";

interface Props {
  text?: string;
  label?: string;
  variant?: "button" | "icon" | "inline";
}

// <wbr> cho xuống dòng sau ":" "/" mà không thêm ký tự: copy, tìm chữ vẫn ra đúng ARN / URL
const breakable = (text: string) =>
  identifierParts(text).map((part, index) => (
    <Fragment key={index}>
      {part}
      <wbr />
    </Fragment>
  ));

export function CopyButton({ text, label = COPY_TEXTS.copy, variant = "button" }: Props) {
  return (
    <CopyToClipboard
      variant={variant}
      textToCopy={text ?? ""}
      textToDisplay={variant === "inline" && text ? breakable(text) : undefined}
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
