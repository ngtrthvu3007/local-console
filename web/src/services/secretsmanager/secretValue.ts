import { z } from "zod";

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
