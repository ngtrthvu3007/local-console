import { Fragment } from "react";

const SEPARATOR = /([:/\-.])/;

// ARN / URL xuống dòng sau dấu phân cách, không cắt giữa từ
export function BreakableText({ text }: { text: string }) {
  return (
    <>
      {text.split(SEPARATOR).map((part, index) => (
        <Fragment key={index}>
          {part}
          {SEPARATOR.test(part) && <wbr />}
        </Fragment>
      ))}
    </>
  );
}
