import type {
  ExplicitAuthFlowsType,
  IdentityProviderTypeType,
  OAuthFlowType,
  UserPoolMfaType,
} from "@aws-sdk/client-cognito-identity-provider";
export const POOL_NAME_MAX_LENGTH = 128;
export const POOL_NAME_PATTERN = /^[\w\s+=,.@-]+$/u;
export const POOL_NAME_ERROR = `Use 1–${POOL_NAME_MAX_LENGTH} letters, numbers, spaces or + = , . @ -`;
export const DELETION_PROTECTION_ERROR =
  "Deletion protection is active. Deactivate it before deleting the user pool.";
export const LIST_POOLS_PAGE_SIZE = 60;
export const SIGN_IN_WITH = { username: "username", email: "email" } as const;
export const EMAIL_ATTRIBUTE = "email";

export const WELL_KNOWN_PATHS = {
  jwks: ".well-known/jwks.json",
  openidConfiguration: ".well-known/openid-configuration",
} as const;

export const COGNITO_DEFAULT_SENDER = "no-reply@verificationemail.com";

export const MFA_LABELS: Record<UserPoolMfaType, string> = {
  OFF: "Off",
  OPTIONAL: "Optional",
  ON: "On",
};

export const DEFAULT_SIGN_IN_LABEL = "Username";
export const SES_IDENTITY_PREFIX = "identity/";

// Floci phục vụ hosted UI dưới tiền tố /cognito-idp (spec 7 #16)
export const HOSTED_UI_PATHS = {
  authorize: "/cognito-idp/oauth2/authorize",
  token: "/cognito-idp/oauth2/token",
  idpResponse: "/cognito-idp/oauth2/idpresponse",
  all: "/cognito-idp/oauth2/*",
} as const;

export const COGNITO_PROVIDER = "COGNITO";
// Hosted UI chỉ mở bằng authorization code flow (response_type=code)
export const CODE_FLOW = "code" satisfies OAuthFlowType;

export const HOSTED_UI_BLOCKERS = {
  domain: "Create a domain on the Identity providers tab first.",
  callbackUrl: "Add a callback URL to this client first.",
  codeFlow: "Turn on the authorization code flow for this client first.",
} as const;

// JWT = header.payload.signature
export const JWT_PART_COUNT = 3;
export const INVALID_JWT_ERROR = "Token is not a valid JWT";
// SECRET_HASH của Cognito = Base64(HMAC-SHA256(clientSecret, username + clientId))
export const SECRET_HASH_ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

export const UNCONFIRMED_STATUS = "UNCONFIRMED";
export const ANY_STATUS = "any";
export const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
export const SUB_ATTRIBUTE = "sub";
export const IDENTITIES_ATTRIBUTE = "identities";
export const LOCKED_ATTRIBUTES = [SUB_ATTRIBUTE, IDENTITIES_ATTRIBUTE] as const;
export const PHONE_ATTRIBUTE = "phone_number";
export const EMAIL_VERIFIED_ATTRIBUTE = "email_verified";
// Cắt giữa username dài: giữ đầu và cuối mỗi bên chừng này ký tự
export const USERNAME_EDGE_LENGTH = 4;
export const USERNAME_ELLIPSIS = "…";
export const LIST_USERS_PAGE_SIZE = 60;

export const USER_FORM_ERRORS = {
  username: "Enter a username.",
  email: "Enter an email address.",
  phone: "Use the E.164 format, for example +84901234567.",
  phoneForSms: "Enter a phone number to send the invitation by SMS.",
  temporaryPassword: "Enter a temporary password, or send an invitation.",
} as const;

export const GROUP_NAME_MAX_LENGTH = 128;
export const GROUP_DESCRIPTION_MAX_LENGTH = 2048;
// Cognito: precedence là số nguyên không âm, tối đa 2^31 - 1
export const GROUP_PRECEDENCE_LIMITS = { min: 0, max: 2_147_483_647 } as const;
export const LIST_GROUPS_PAGE_SIZE = 60;

export const AUTH_FLOWS = [
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_USER_SRP_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
  "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  "ALLOW_CUSTOM_AUTH",
] as const;

const DEFAULT_AUTH_FLOW_COUNT = 3;

export const DEFAULT_AUTH_FLOWS: ExplicitAuthFlowsType[] = AUTH_FLOWS.slice(
  0,
  DEFAULT_AUTH_FLOW_COUNT,
);

export const USER_PASSWORD_AUTH_FLOW = "ALLOW_USER_PASSWORD_AUTH";
// Không có ô Client credentials (drift h): client có sẵn flow đó chỉ được giữ nguyên khi sửa
export const OAUTH_FLOWS = { code: "Authorization code", implicit: "Implicit" } as const;

export const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "phone",
  "aws.cognito.signin.user.admin",
] as const;

export const DEFAULT_OAUTH_SCOPES: string[] = ["openid", "email", "profile"];
export const CLIENT_NAME_MAX_LENGTH = 128;
export const LIST_CLIENTS_PAGE_SIZE = 60;

export const CLIENT_FORM_ERRORS = {
  name: "Enter an app client name.",
  nameLength: `Must be at most ${CLIENT_NAME_MAX_LENGTH} characters.`,
  url: "Enter a valid URL, for example https://localhost:3000/callback.",
  callbackRequired: "Add a callback URL to turn on the authorization code or implicit flow.",
  urlsNeedFlow: "Turn on an OAuth flow, or remove the callback and sign-out URLs.",
  clientCredentialsMix:
    "Client credentials can't be combined with the authorization code or implicit flow.",
  scopeRequired: "Choose at least one scope to turn on the authorization code or implicit flow.",
} as const;

export const CLIENT_SECRET_MODES = { none: "none", generate: "generate" } as const;

export const SIGN_IN_FORM_ERRORS = {
  client: "Choose an app client.",
  username: USER_FORM_ERRORS.username,
  password: "Enter a password.",
  newPassword: "Enter a new password.",
} as const;

// Pool đăng nhập bằng email: InitiateAuth trả username nội bộ (UUID) trong tham số này
export const CHALLENGE_USERNAME_PARAMETER = "USER_ID_FOR_SRP";
export const GROUPS_CLAIM = "cognito:groups";
export const GROUPS_SEPARATOR = ", ";
export const NO_TOKENS_ERROR = "Cognito returned no tokens";
// Test sign-in chỉ xử lý NEW_PASSWORD_REQUIRED; MFA, custom auth… báo rõ thay vì im lặng
export const unsupportedChallengeError = (challenge: string) =>
  `Test sign-in doesn't support the ${challenge} challenge.`;
// Prefix domain của Cognito: 1–63 ký tự thường, số, "-", không bắt đầu / kết thúc bằng "-"
export const DOMAIN_PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const DOMAIN_PREFIX_ERROR =
  "Use 1–63 lowercase letters, numbers or hyphens, not starting or ending with a hyphen.";

// Chỉ import type từ SDK: poolUpdate.ts import file này và phải chạy được bằng Node thuần
export const PROVIDER_TYPES = { OIDC: "OIDC", Google: "Google" } as const satisfies Record<
  string,
  IdentityProviderTypeType
>;

export const GOOGLE_PROVIDER_NAME = "Google";
// Tên OIDC: 1–32 ký tự, không có "_" vì username federated là <Provider>_<id>
export const OIDC_NAME_PATTERN = /^[^_]{1,32}$/;
export const DEFAULT_AUTHORIZE_SCOPES = "openid email profile";
export const ATTRIBUTES_REQUEST_METHOD = "GET";

// Khóa ProviderDetails của CreateIdentityProvider / UpdateIdentityProvider
export const PROVIDER_DETAIL_KEYS = {
  clientId: "client_id",
  clientSecret: "client_secret",
  scopes: "authorize_scopes",
  issuer: "oidc_issuer",
  authorizeUrl: "authorize_url",
  tokenUrl: "token_url",
  attributesUrl: "attributes_url",
  jwksUri: "jwks_uri",
  attributesRequestMethod: "attributes_request_method",
} as const;

export const LIST_PROVIDERS_PAGE_SIZE = 60;

export const PROVIDER_FORM_ERRORS = {
  name: "Use 1–32 characters, without underscores.",
  clientId: "Enter a client ID.",
  clientSecret: "Enter a client secret.",
  scopes: "Enter at least one scope.",
  url: "Enter a valid URL, for example http://host.docker.internal:8080/token.",
  poolAttribute: "Choose a user pool attribute.",
  idpClaim: "Enter an IdP claim.",
} as const;
