import {
  ChallengeNameType,
  type AuthenticationResultType,
  type InitiateAuthResponse,
} from "@aws-sdk/client-cognito-identity-provider";
import { MILLISECONDS_PER_SECOND } from "#shared/constants.ts";
import { fromBase64, toBase64 } from "#shared/utils/encoding.ts";
import {
  CHALLENGE_USERNAME_PARAMETER,
  CODE_FLOW,
  HOSTED_UI_BLOCKERS,
  HOSTED_UI_PATHS,
  INVALID_JWT_ERROR,
  JWT_PART_COUNT,
  NO_TOKENS_ERROR,
  SECRET_HASH_ALGORITHM,
  unsupportedChallengeError,
} from "./constants.ts";

export const issuerUrl = (baseUrl: string, poolId: string) => `${baseUrl}/${poolId}`;

export const wellKnownUrl = (baseUrl: string, poolId: string, path: string) =>
  `${baseUrl}/${poolId}/${path}`;

type JwtPayload = Record<string, unknown> & {
  exp?: number;
  iat?: number;
  "cognito:groups"?: string[];
};

// base64url → UTF-8: claim có dấu (tên tiếng Việt) cần TextDecoder
const decodeJwtPart = (part: string) =>
  JSON.parse(new TextDecoder().decode(fromBase64(part.replaceAll("-", "+").replaceAll("_", "/"))));

// Chỉ đọc claim để hiện token; chữ ký do service nhận token kiểm
export function decodeJwt(token: string): { header: Record<string, unknown>; payload: JwtPayload } {
  const parts = token.split(".");
  if (parts.length !== JWT_PART_COUNT) throw new Error(INVALID_JWT_ERROR);
  const [header, payload] = parts;
  return { header: decodeJwtPart(header), payload: decodeJwtPart(payload) };
}

// Client có secret: mọi lệnh auth phải kèm SECRET_HASH. WebCrypto để chạy được trong trình duyệt
export async function secretHash(
  clientSecret: string,
  username: string,
  clientId: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(clientSecret),
    SECRET_HASH_ALGORITHM,
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    SECRET_HASH_ALGORITHM.name,
    key,
    encoder.encode(username + clientId),
  );

  return toBase64(new Uint8Array(signature));
}

// exp của JWT tính bằng giây
export const isExpired = (exp: number, nowMs: number) => exp * MILLISECONDS_PER_SECOND <= nowMs;

export function hostedUiUrl(input: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  identityProvider?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: CODE_FLOW,
    redirect_uri: input.redirectUri,
    scope: input.scopes.join(" "),
    state: input.state,
  });

  // Có identity_provider thì Floci chuyển thẳng sang IdP, bỏ qua form của Cognito
  if (input.identityProvider) params.set("identity_provider", input.identityProvider);
  return `${input.baseUrl}${HOSTED_UI_PATHS.authorize}?${params}`;
}

// Thứ tự theo bước người dùng phải làm: domain → callback URL → code flow
export function hostedUiBlocker(input: {
  hasDomain: boolean;
  callbackUrls: string[];
  oauthFlows: string[];
}): string | undefined {
  if (!input.hasDomain) return HOSTED_UI_BLOCKERS.domain;
  if (input.callbackUrls.length === 0) return HOSTED_UI_BLOCKERS.callbackUrl;
  if (!input.oauthFlows.includes(CODE_FLOW)) return HOSTED_UI_BLOCKERS.codeFlow;
  return undefined;
}

export type SignInResult =
  | { kind: "tokens"; tokens: AuthenticationResultType }
  | { kind: "newPassword"; session: string; username: string };

export function toSignInResult(output: InitiateAuthResponse, typedUsername: string): SignInResult {
  if (output.AuthenticationResult) return { kind: "tokens", tokens: output.AuthenticationResult };
  if (!output.ChallengeName) throw new Error(NO_TOKENS_ERROR);
  if (output.ChallengeName !== ChallengeNameType.NEW_PASSWORD_REQUIRED || !output.Session)
    throw new Error(unsupportedChallengeError(output.ChallengeName));

  return {
    kind: "newPassword",
    session: output.Session,
    // Floci/AWS cần username nội bộ: pool email là UUID, pool username thì sub bị "Invalid session"
    username: output.ChallengeParameters?.[CHALLENGE_USERNAME_PARAMETER] ?? typedUsername,
  };
}
