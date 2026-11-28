import { AUTHORIZER_TYPE_LABELS, COGNITO_POOL_MARKER } from "./constants.ts";

export function cognitoPoolIdOfProviderArn(arn: string) {
  const at = arn.indexOf(COGNITO_POOL_MARKER);
  return at < 0 ? "" : arn.slice(at + COGNITO_POOL_MARKER.length);
}

export const isLocalIssuer = (issuer: string, urls: readonly string[]) =>
  URL.canParse(issuer) &&
  urls.some((u) => URL.canParse(u) && new URL(u).host === new URL(issuer).host);

export const authorizerTypeLabel = (type: string) => AUTHORIZER_TYPE_LABELS[type] ?? type;
