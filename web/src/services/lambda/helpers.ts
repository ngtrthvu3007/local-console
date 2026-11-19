import type {
  EventSourceMappingConfiguration,
  FunctionConfiguration,
} from "@aws-sdk/client-lambda";
import { proxyEndpoint } from "@shared/aws.ts";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { LOG_GROUP_PREFIX } from "./constants.ts";

// Code.Location trỏ vào host nội bộ của Floci (http://floci:4566) mà trình duyệt không mở được,
// và chữ ký gắn với host đó; đi qua proxy của console thì Floci nhận đúng host.
// Cần tải gói về để mở editor
export function codeDownloadUrl(location: string) {
  const url = new URL(location);
  return `${proxyEndpoint()}${url.pathname}${url.search}`;
}

export const logGroupOf = (configuration: FunctionConfiguration) =>
  configuration.LoggingConfig?.LogGroup ?? `${LOG_GROUP_PREFIX}${configuration.FunctionName}`;

// Runtime Python ghi log nhiều dòng (stack trace) bằng \r để CloudWatch giữ thành một event
const CARRIAGE_RETURNS = /\r\n?/g;
const LINE_BREAK = "\n";

export const logMessageText = (message = "") =>
  message.replace(CARRIAGE_RETURNS, LINE_BREAK).trimEnd();

const FUNCTION_ARN_MARKER = ":function:";

const ARN_SEPARATOR = ":";

// "arn:aws:lambda:…:function:my-function:prod" → "my-function" (bỏ version / alias)
export const functionNameOfArn = (arn: string) =>
  arn.split(FUNCTION_ARN_MARKER)[1]?.split(ARN_SEPARATOR)[0] ?? NOT_AVAILABLE;

// Function của event source mapping: "arn:aws:lambda:…:function:my-function" → "my-function"
export const functionNameOfMapping = (mapping: EventSourceMappingConfiguration) =>
  mapping.FunctionArn?.split(FUNCTION_ARN_MARKER)[1] ?? NOT_AVAILABLE;
