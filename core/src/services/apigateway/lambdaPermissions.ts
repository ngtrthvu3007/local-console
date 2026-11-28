import { FLOCI_ACCOUNT_ID } from "#shared/constants.ts";
import {
  ANY_METHOD,
  APIGATEWAY_PRINCIPAL,
  ARN_WILDCARD,
  AUTHORIZERS_ARN_SEGMENT,
  EXECUTE_API_ARN_PREFIX,
  ROUTE_KEY_SEPARATOR,
  SOURCE_ARN_KEY,
  STATEMENT_ID_MAX_LENGTH,
  STATEMENT_ID_PREFIX,
} from "./constants.ts";

export type ApiGatewaySource = { apiId: string; stage: string; method: string; path: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Policy do người dùng nhập có thể sai định dạng nên không tin kiểu
function statementsOf(policy: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(policy);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  const { Statement } = parsed;
  if (Array.isArray(Statement)) return Statement;
  if (Statement) return [Statement];
  return [];
}

function sourceArnOf(statement: Record<string, unknown>): string | undefined {
  const { Condition } = statement;
  if (!isRecord(Condition)) return undefined;
  for (const operator of Object.values(Condition)) {
    if (isRecord(operator) && typeof operator[SOURCE_ARN_KEY] === "string") {
      return operator[SOURCE_ARN_KEY];
    }
  }
  return undefined;
}

export function apiGatewaySourcesOf(policy: string): ApiGatewaySource[] {
  const found = new Map<string, ApiGatewaySource>();
  for (const statement of statementsOf(policy)) {
    if (!isRecord(statement) || !isRecord(statement.Principal)) continue;
    const { Service } = statement.Principal;
    const services = Array.isArray(Service) ? Service : [Service];
    if (!services.includes(APIGATEWAY_PRINCIPAL)) continue;
    const arn = sourceArnOf(statement);
    if (!arn?.startsWith(EXECUTE_API_ARN_PREFIX)) continue;
    // arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<method>/<path...>
    const [apiId, stage = ARN_WILDCARD, method = ARN_WILDCARD, ...rest] = arn
      .split(":")
      .slice(5)
      .join(":")
      .split("/");
    const path = rest.length ? `/${rest.join("/")}` : "";
    // Gộp bản test-invoke-stage CDK thêm vào: stage không nằm trong khóa
    const key = `${apiId}|${method}|${path}`;
    if (!found.has(key)) found.set(key, { apiId, stage, method, path });
  }
  return [...found.values()];
}

export type PermissionTarget =
  | { kind: "method"; method: string; path: string }
  | { kind: "route"; routeKey: string }
  | { kind: "authorizer"; authorizerId: string };

const STATEMENT_ID_INVALID = /[^A-Za-z0-9_-]/g;
const STATEMENT_ID_REPLACEMENT = "_";

const methodPart = (method: string) => (method === ANY_METHOD ? ARN_WILDCARD : method);
const pathPart = (path: string) => path.replace(/^\//, "");

// Phần sau "<apiId>/" của SourceArn, cùng dạng AWS console tạo (stage luôn là *)
function sourcePath(target: PermissionTarget) {
  if (target.kind === "authorizer") return `${AUTHORIZERS_ARN_SEGMENT}/${target.authorizerId}`;
  if (target.kind === "method") {
    return `${ARN_WILDCARD}/${methodPart(target.method)}/${pathPart(target.path)}`;
  }
  // Route không có dấu cách ($default, $connect, route WebSocket) đứng thay cho method
  const [method, path] = target.routeKey.split(ROUTE_KEY_SEPARATOR);
  return path === undefined
    ? `${ARN_WILDCARD}/${method}`
    : `${ARN_WILDCARD}/${methodPart(method)}/${pathPart(path)}`;
}

export const executeApiSourceArn = (region: string, apiId: string, target: PermissionTarget) =>
  `${EXECUTE_API_ARN_PREFIX}${region}:${FLOCI_ACCOUNT_ID}:${apiId}/${sourcePath(target)}`;

// Cùng API + method / route / authorizer ra cùng ID: gắn lại không thêm statement trùng
// FNV-1a 32 bit: hai SourceArn khác nhau vẫn ra ID khác dù phần đọc được bị thay ký tự / cắt bớt
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HASH_RADIX = 36;

function shortHash(text: string) {
  let hash = FNV_OFFSET;
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME) >>> 0;
  return hash.toString(HASH_RADIX);
}

export function permissionStatementId(apiId: string, target: PermissionTarget) {
  const path = sourcePath(target);
  const hash = shortHash(path);
  const readable = `${STATEMENT_ID_PREFIX}-${apiId}-${path}`
    .replace(STATEMENT_ID_INVALID, STATEMENT_ID_REPLACEMENT)
    .slice(0, STATEMENT_ID_MAX_LENGTH - hash.length - 1);
  return `${readable}-${hash}`;
}
