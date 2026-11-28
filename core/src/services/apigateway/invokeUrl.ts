import { FLOCI_HOSTNAME } from "#shared/constants.ts";
import {
  CONNECTIONS_SEGMENT,
  EXECUTE_API_SEGMENT,
  HEADER_ERROR,
  RESTAPIS_SEGMENT,
  USER_REQUEST_SEGMENT,
  WEBSOCKET_SCHEME,
} from "./constants.ts";

export const restInvokeUrl = (base: string, apiId: string, stage: string) =>
  `${base}/${RESTAPIS_SEGMENT}/${apiId}/${stage}/${USER_REQUEST_SEGMENT}/`;

export const webSocketUrl = (publicUrl: string, region: string, apiId: string, stage: string) => {
  // Cổng mặc định (80 / 443) thì URL.port rỗng, không được để dư ":"
  const { port } = new URL(publicUrl);
  return `${WEBSOCKET_SCHEME}${apiId}.${EXECUTE_API_SEGMENT}.${region}.${FLOCI_HOSTNAME}${port && `:${port}`}/${stage}`;
};

export const connectionsUrl = (publicUrl: string, apiId: string, stage: string) =>
  `${publicUrl}/${EXECUTE_API_SEGMENT}/${apiId}/${stage}/${CONNECTIONS_SEGMENT}`;

const PATH_PARAM = /\{([^{}+]+)(\+?)\}/g;

export const pathParamsOf = (resourcePath: string) =>
  [...resourcePath.matchAll(PATH_PARAM)].map((m) => ({ name: m[1], greedy: m[2] === "+" }));

// {x} mã hóa cả "/"; {x+} giữ "/" làm dấu tách đoạn
export const buildTestPath = (resourcePath: string, params: Record<string, string>) =>
  resourcePath.replace(PATH_PARAM, (_, name: string, greedy: string) => {
    const value = params[name] ?? "";
    return greedy ? value.split("/").map(encodeURIComponent).join("/") : encodeURIComponent(value);
  });

export const testInvokeUrl = (
  base: string,
  apiId: string,
  stage: string,
  path: string,
  query: string,
) =>
  `${base}/${RESTAPIS_SEGMENT}/${apiId}/${stage}/${USER_REQUEST_SEGMENT}${path}${query ? `?${query}` : ""}`;

export function parseHeaderLines(
  text: string,
): { headers: [string, string][] } | { error: string } {
  const headers: [string, string][] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) return { error: HEADER_ERROR };
    headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return { headers };
}
