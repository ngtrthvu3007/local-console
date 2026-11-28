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

export function reformatJson(text: string): string {
  try {
    return prettyJson(JSON.parse(text));
  } catch {
    return text;
  }
}

export function jsonObjectError(
  text: string,
  notObjectMessage = "Must be a JSON object.",
): string | undefined {
  const syntax = jsonError(text);
  if (syntax || !text.trim()) return syntax;
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? undefined
    : notObjectMessage;
}
