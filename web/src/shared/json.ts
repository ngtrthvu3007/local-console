const INDENT_SPACES = 2;

export function jsonError(text: string): string | undefined {
  if (!text.trim()) return undefined;
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return `Invalid JSON: ${(error as Error).message}`;
  }
}

export const prettyJson = (value: unknown) => JSON.stringify(value, null, INDENT_SPACES);

// JSON có thể bị nén một dòng (vd: bucket policy S3 trả về)
export function reformatJson(text: string): string {
  try {
    return prettyJson(JSON.parse(text));
  } catch {
    return text;
  }
}
