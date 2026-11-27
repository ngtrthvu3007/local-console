import { FLOCI_ACCOUNT_ID } from "#shared/constants.ts";
import type { ApiType, AuthorizerRow } from "./apis.ts";
import {
  AUTH_CUSTOM,
  AUTH_IAM,
  AUTH_NONE,
  AUTHORIZER_TYPE_LABELS,
  AUTHORIZER_TYPES,
  COGNITO_POOL_ARN_PREFIX,
  COGNITO_POOL_MARKER,
  IDENTITY_LIST_SEPARATOR,
  IDENTITY_PREFIXES,
} from "./constants.ts";

export function cognitoPoolIdOfProviderArn(arn: string) {
  const at = arn.indexOf(COGNITO_POOL_MARKER);
  return at < 0 ? "" : arn.slice(at + COGNITO_POOL_MARKER.length);
}

export const isLocalIssuer = (issuer: string, urls: readonly string[]) =>
  URL.canParse(issuer) &&
  urls.some((u) => URL.canParse(u) && new URL(u).host === new URL(issuer).host);

export const authorizerTypeLabel = (type: string) => AUTHORIZER_TYPE_LABELS[type] ?? type;

export type IdentityKind = "header" | "querystring";

export const identitySources = (apiType: ApiType, kind: IdentityKind, names: readonly string[]) =>
  names.map((name) => `${IDENTITY_PREFIXES[apiType]}${kind}.${name}`);

// REST nối bằng ",", v2 đã được nối bằng ", " khi đọc
export function identityNamesOf(identitySource: string): { kind: IdentityKind; names: string[] } {
  const sources = identitySource
    .split(IDENTITY_LIST_SEPARATOR)
    .map((source) => source.trim())
    .filter(Boolean);
  const kind: IdentityKind = sources.some((source) => source.includes(".querystring."))
    ? "querystring"
    : "header";
  const marker = `.${kind}.`;
  const names = sources.map((source) =>
    source.includes(marker) ? source.slice(source.indexOf(marker) + marker.length) : source,
  );
  return { kind, names };
}

export const cognitoPoolArn = (region: string, poolId: string) =>
  `${COGNITO_POOL_ARN_PREFIX}${region}:${FLOCI_ACCOUNT_ID}:${COGNITO_POOL_MARKER}${poolId}`;

export interface Authorization {
  authorizationType: string;
  authorizerId?: string;
}

// value: NONE, AWS_IAM hoặc ID authorizer đang chọn trong form
export function authorizationOf(
  value: string,
  authorizers: readonly Pick<AuthorizerRow, "id" | "type">[],
): Authorization | undefined {
  if (value === AUTH_NONE || value === AUTH_IAM) return { authorizationType: value };
  // Không thấy: authorizer đã bị xóa, hoặc danh sách chưa tải
  const authorizer = authorizers.find(({ id }) => id === value);
  if (!authorizer) return undefined;

  const ownType =
    authorizer.type === AUTHORIZER_TYPES.jwt || authorizer.type === AUTHORIZER_TYPES.cognito;
  return {
    authorizationType: ownType ? authorizer.type : AUTH_CUSTOM,
    authorizerId: authorizer.id,
  };
}

const LAMBDA_AUTHORIZER_TYPES: readonly string[] = [
  AUTHORIZER_TYPES.token,
  AUTHORIZER_TYPES.request,
];
export const isLambdaAuthorizer = (type: string) => LAMBDA_AUTHORIZER_TYPES.includes(type);

// Các loại chỉ đọc token từ đúng một chỗ
const SINGLE_SOURCE_TYPES: readonly string[] = [
  AUTHORIZER_TYPES.token,
  AUTHORIZER_TYPES.cognito,
  AUTHORIZER_TYPES.jwt,
];
export const readsOneSource = (type: string) => SINGLE_SOURCE_TYPES.includes(type);
