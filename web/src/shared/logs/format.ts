// Runtime Python ghi log nhiều dòng (stack trace) bằng \r để CloudWatch giữ thành một event
const CARRIAGE_RETURNS = /\r\n?/g;
const LINE_BREAK = "\n";

export const logMessageText = (message = "") =>
  message.replace(CARRIAGE_RETURNS, LINE_BREAK).trimEnd();
