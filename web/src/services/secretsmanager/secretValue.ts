import { z } from "zod";
import { prettyJson } from "@shared/json.ts";

export interface KeyValue {
  key: string;
  value: string;
}

// Chỉ object phẳng toàn string mới sửa dạng bảng: kiểu khác lưu lại sẽ đổi kiểu dữ liệu app đang đọc
const flatStringObject = z.record(z.string(), z.string());

export function keyValueOf(text: string): KeyValue[] | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  const result = flatStringObject.safeParse(parsed);

  return result.success
    ? Object.entries(result.data).map(([key, value]) => ({ key, value }))
    : undefined;
}

export const textOfKeyValue = (entries: readonly KeyValue[]) =>
  JSON.stringify(Object.fromEntries(entries.map(({ key, value }) => [key, value])));

// JSON nén một dòng (vd: secret rds!… của RDS) thì thụt lề cho dễ đọc. Chỉ khi in lại ra đúng chuỗi gốc:
// số quá lớn, key trùng… sẽ đổi giá trị nếu format, mà nút Copy chép đúng chữ đang hiện
export function readableText(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed) === text ? prettyJson(parsed) : text;
  } catch {
    return text;
  }
}
