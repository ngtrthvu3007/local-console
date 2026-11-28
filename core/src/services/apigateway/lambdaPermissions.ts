import {
  APIGATEWAY_PRINCIPAL,
  ARN_WILDCARD,
  EXECUTE_API_ARN_PREFIX,
  SOURCE_ARN_KEY,
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
