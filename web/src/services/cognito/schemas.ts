import { z } from "zod";
import {
  DeliveryMediumType,
  ExplicitAuthFlowsType,
  OAuthFlowType,
  type CreateUserPoolClientRequest,
  type UserPoolClientType,
  type EmailConfigurationType,
  EmailSendingAccountType,
  MessageActionType,
  type AdminCreateUserCommandInput,
  type CreateGroupCommandInput,
  type CreateUserPoolCommandInput,
  type IdentityProviderType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CLIENT_FORM_ERRORS,
  CLIENT_NAME_MAX_LENGTH,
  COGNITO_PROVIDER,
  DEFAULT_AUTH_FLOWS,
  DEFAULT_OAUTH_SCOPES,
  E164_PATTERN,
  EMAIL_ATTRIBUTE,
  EMAIL_VERIFIED_ATTRIBUTE,
  PHONE_ATTRIBUTE,
  USER_FORM_ERRORS,
  POOL_NAME_ERROR,
  POOL_NAME_MAX_LENGTH,
  POOL_NAME_PATTERN,
  SIGN_IN_WITH,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_PRECEDENCE_LIMITS,
  SIGN_IN_FORM_ERRORS,
  SES_IDENTITY_PREFIX,
  DOMAIN_PREFIX_ERROR,
  DOMAIN_PREFIX_PATTERN,
  PROVIDER_TYPES,
  GOOGLE_PROVIDER_NAME,
  OIDC_NAME_PATTERN,
  DEFAULT_AUTHORIZE_SCOPES,
  ATTRIBUTES_REQUEST_METHOD,
  PROVIDER_DETAIL_KEYS,
  PROVIDER_FORM_ERRORS,
} from "./constants.ts";
import { wholeNumberIn } from "../lambda/schemas.ts";
import { LAMBDA_TRIGGERS } from "./triggers.ts";

export const createPoolSchema = z.object({
  name: z
    .string()
    .min(1, POOL_NAME_ERROR)
    .max(POOL_NAME_MAX_LENGTH, POOL_NAME_ERROR)
    .regex(POOL_NAME_PATTERN, POOL_NAME_ERROR),
  signInWith: z.enum([SIGN_IN_WITH.username, SIGN_IN_WITH.email]),
  autoVerifyEmail: z.boolean(),
});

export type CreatePoolForm = z.input<typeof createPoolSchema>;

export function toCreateUserPoolInput(form: CreatePoolForm): CreateUserPoolCommandInput {
  return {
    PoolName: form.name,
    ...(form.signInWith === SIGN_IN_WITH.email && { UsernameAttributes: [EMAIL_ATTRIBUTE] }),
    ...(form.autoVerifyEmail && { AutoVerifiedAttributes: [EMAIL_ATTRIBUTE] }),
  };
}

export const createUserSchema = (signInWithEmail: boolean) =>
  z
    .object({
      username: z.string().trim(),
      email: z.string().trim(),
      emailVerified: z.boolean(),
      phone: z.string().trim(),
      temporaryPassword: z.string(),
      inviteEmail: z.boolean(),
      inviteSms: z.boolean(),
    })
    .superRefine((form, context) => {
      const fail = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
      if (!signInWithEmail && !form.username) fail("username", USER_FORM_ERRORS.username);
      if ((signInWithEmail || form.inviteEmail) && !form.email) fail("email", USER_FORM_ERRORS.email);
      if (form.phone && !E164_PATTERN.test(form.phone)) fail("phone", USER_FORM_ERRORS.phone);
      else if (form.inviteSms && !form.phone) fail("phone", USER_FORM_ERRORS.phoneForSms);
      if (!form.inviteEmail && !form.inviteSms && !form.temporaryPassword)
        fail("temporaryPassword", USER_FORM_ERRORS.temporaryPassword);
    });

export type CreateUserForm = z.input<ReturnType<typeof createUserSchema>>;

export function toAdminCreateUserInput(
  poolId: string,
  form: CreateUserForm,
  signInWithEmail: boolean,
): AdminCreateUserCommandInput {
  const mediums = [
    ...(form.inviteEmail ? [DeliveryMediumType.EMAIL] : []),
    ...(form.inviteSms ? [DeliveryMediumType.SMS] : []),
  ];
  return {
    UserPoolId: poolId,
    Username: signInWithEmail ? form.email : form.username,
    ...(form.temporaryPassword && { TemporaryPassword: form.temporaryPassword }),
    ...(mediums.length ? { DesiredDeliveryMediums: mediums } : { MessageAction: MessageActionType.SUPPRESS }),
    UserAttributes: [
      ...(form.email
        ? [
            { Name: EMAIL_ATTRIBUTE, Value: form.email },
            { Name: EMAIL_VERIFIED_ATTRIBUTE, Value: String(form.emailVerified) },
          ]
        : []),
      ...(form.phone ? [{ Name: PHONE_ATTRIBUTE, Value: form.phone }] : []),
    ],
  };
}

export const setPasswordSchema = z.object({ password: z.string().min(1, "Enter a password."), permanent: z.boolean() });
export type SetPasswordForm = z.input<typeof setPasswordSchema>;

export const signInSchema = z.object({
  clientId: z.string().min(1, SIGN_IN_FORM_ERRORS.client),
  username: z.string().min(1, SIGN_IN_FORM_ERRORS.username),
  password: z.string().min(1, SIGN_IN_FORM_ERRORS.password),
});
export type SignInForm = z.input<typeof signInSchema>;

export const newPasswordSchema = z.object({ newPassword: z.string().min(1, SIGN_IN_FORM_ERRORS.newPassword) });
export type NewPasswordForm = z.input<typeof newPasswordSchema>;

export const attributeSchema = z.object({ name: z.string().min(1, "Choose an attribute."), value: z.string() });
export type AttributeForm = z.input<typeof attributeSchema>;

const precedenceSchema = wholeNumberIn(GROUP_PRECEDENCE_LIMITS, "");
export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Enter a group name.")
    .max(GROUP_NAME_MAX_LENGTH, `Must be at most ${GROUP_NAME_MAX_LENGTH} characters.`),
  description: z.string().max(GROUP_DESCRIPTION_MAX_LENGTH, `Must be at most ${GROUP_DESCRIPTION_MAX_LENGTH} characters.`),
  // Precedence tùy chọn: rỗng thì bỏ qua, có giá trị thì phải là số nguyên hợp lệ
  precedence: z.string().trim().refine((text) => text === "" || precedenceSchema.safeParse(text).success, `Enter a whole number from ${GROUP_PRECEDENCE_LIMITS.min} to ${GROUP_PRECEDENCE_LIMITS.max}.`),
});
export type CreateGroupForm = z.input<typeof createGroupSchema>;

export function toCreateGroupInput(poolId: string, form: CreateGroupForm): CreateGroupCommandInput {
  return {
    UserPoolId: poolId,
    GroupName: form.name,
    ...(form.description && { Description: form.description }),
    ...(form.precedence.trim() && { Precedence: Number(form.precedence) }),
  };
}

const urlRowSchema = z.object({ value: z.string().trim().pipe(z.url(CLIENT_FORM_ERRORS.url)) });
const FLOWS_NEEDING_CALLBACK: string[] = [OAuthFlowType.code, OAuthFlowType.implicit];

export const clientSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, CLIENT_FORM_ERRORS.name)
      .max(CLIENT_NAME_MAX_LENGTH, CLIENT_FORM_ERRORS.nameLength),
    generateSecret: z.boolean(),
    authFlows: z.array(z.enum(ExplicitAuthFlowsType)),
    callbackUrls: z.array(urlRowSchema),
    logoutUrls: z.array(urlRowSchema),
    oauthFlows: z.array(z.enum(OAuthFlowType)),
    scopes: z.array(z.string()),
    providers: z.array(z.string()),
  })
  .superRefine((form, context) => {
    // Floci từ chối URL khi tắt OAuth, AWS từ chối trộn client_credentials với code / implicit
    if (!form.oauthFlows.length && (form.callbackUrls.length || form.logoutUrls.length))
      context.addIssue({ code: "custom", path: ["callbackUrls"], message: CLIENT_FORM_ERRORS.urlsNeedFlow });
    const needsCallback = form.oauthFlows.some((flow) => FLOWS_NEEDING_CALLBACK.includes(flow));
    if (needsCallback && form.oauthFlows.includes(OAuthFlowType.client_credentials))
      context.addIssue({ code: "custom", path: ["oauthFlows"], message: CLIENT_FORM_ERRORS.clientCredentialsMix });
    if (!needsCallback) return;
    if (!form.callbackUrls.length)
      context.addIssue({ code: "custom", path: ["callbackUrls"], message: CLIENT_FORM_ERRORS.callbackRequired });
    if (!form.scopes.length)
      context.addIssue({ code: "custom", path: ["scopes"], message: CLIENT_FORM_ERRORS.scopeRequired });
  });

export type ClientForm = z.input<typeof clientSchema>;

type ClientFields = Pick<
  CreateUserPoolClientRequest,
  | "ClientName"
  | "ExplicitAuthFlows"
  | "CallbackURLs"
  | "LogoutURLs"
  | "AllowedOAuthFlows"
  | "AllowedOAuthScopes"
  | "AllowedOAuthFlowsUserPoolClient"
  | "SupportedIdentityProviders"
>;

export function toClientFields(form: ClientForm): ClientFields {
  const hasFlows = form.oauthFlows.length > 0;
  return {
    ClientName: form.name.trim(),
    ExplicitAuthFlows: form.authFlows,
    CallbackURLs: form.callbackUrls.map((row) => row.value.trim()),
    LogoutURLs: form.logoutUrls.map((row) => row.value.trim()),
    SupportedIdentityProviders: form.providers,
    AllowedOAuthFlowsUserPoolClient: hasFlows,
    ...(hasFlows && { AllowedOAuthFlows: form.oauthFlows, AllowedOAuthScopes: form.scopes }),
  };
}

// Giữ nguyên flow / scope của client kể cả giá trị form không có ô (vd client_credentials), để Edit không âm thầm gỡ
export function clientFormOf(client?: UserPoolClientType): ClientForm {
  if (!client)
    return {
      name: "",
      generateSecret: false,
      authFlows: DEFAULT_AUTH_FLOWS,
      callbackUrls: [],
      logoutUrls: [],
      oauthFlows: [],
      scopes: DEFAULT_OAUTH_SCOPES,
      providers: [COGNITO_PROVIDER],
    };
  return {
    name: client.ClientName ?? "",
    generateSecret: Boolean(client.ClientSecret),
    authFlows: client.ExplicitAuthFlows ?? [],
    callbackUrls: (client.CallbackURLs ?? []).map((value) => ({ value })),
    logoutUrls: (client.LogoutURLs ?? []).map((value) => ({ value })),
    oauthFlows: client.AllowedOAuthFlows ?? [],
    scopes: client.AllowedOAuthScopes ?? [],
    providers: client.SupportedIdentityProviders ?? [],
  };
}

// Mỗi loại trigger một ô; "" = None
export const triggersSchema = z.record(z.enum(LAMBDA_TRIGGERS.map(({ key }) => key)), z.string());

export const emailSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("cognito") }),
  z.object({
    source: z.literal("ses"),
    identity: z.string().min(1, "Choose an SES identity."),
    from: z.string().trim(),
    replyTo: z.string().trim().refine((text) => text === "" || z.email().safeParse(text).success, "Enter a valid email address."),
  }),
]);
export type EmailForm = z.input<typeof emailSchema>;

// Luôn điền đủ ô SES kể cả khi đang Cognito default, để chuyển tile sang SES không gặp giá trị undefined
export function emailFormOf(email?: EmailConfigurationType) {
  return {
    source: email?.EmailSendingAccount === EmailSendingAccountType.DEVELOPER ? ("ses" as const) : ("cognito" as const),
    identity: email?.SourceArn?.split(SES_IDENTITY_PREFIX)[1] ?? "",
    from: email?.From ?? "",
    replyTo: email?.ReplyToEmailAddress ?? "",
  };
}

export const domainSchema = z.object({ prefix: z.string().trim().regex(DOMAIN_PREFIX_PATTERN, DOMAIN_PREFIX_ERROR) });
export type DomainForm = z.input<typeof domainSchema>;

const OIDC_URL_FIELDS = ["issuer", "authorizeUrl", "tokenUrl", "attributesUrl", "jwksUri"] as const;

// Một object phẳng cho cả hai loại: Google bỏ qua trường OIDC (superRefine), đổi tile không mất giá trị đã gõ
// Edit không kiểm tên: provider tạo bằng IaC có thể có tên ngoài pattern và tên không sửa được
export const providerEditSchema = z
  .object({
    type: z.enum(PROVIDER_TYPES),
    name: z.string().trim(),
    clientId: z.string().trim().min(1, PROVIDER_FORM_ERRORS.clientId),
    clientSecret: z.string().trim().min(1, PROVIDER_FORM_ERRORS.clientSecret),
    scopes: z.string().trim().min(1, PROVIDER_FORM_ERRORS.scopes),
    issuer: z.string().trim(),
    authorizeUrl: z.string().trim(),
    tokenUrl: z.string().trim(),
    attributesUrl: z.string().trim(),
    jwksUri: z.string().trim(),
    attributesRequestMethod: z.string(),
    mapping: z.array(
      z.object({
        poolAttribute: z.string().min(1, PROVIDER_FORM_ERRORS.poolAttribute),
        idpClaim: z.string().trim().min(1, PROVIDER_FORM_ERRORS.idpClaim),
      }),
    ),
  })
  .superRefine((form, context) => {
    if (form.type !== PROVIDER_TYPES.OIDC) return;
    for (const field of OIDC_URL_FIELDS)
      if (!z.url().safeParse(form[field]).success)
        context.addIssue({ code: "custom", path: [field], message: PROVIDER_FORM_ERRORS.url });
  });

export const providerSchema = providerEditSchema.superRefine((form, context) => {
  if (form.type !== PROVIDER_TYPES.OIDC) return;
  if (!OIDC_NAME_PATTERN.test(form.name))
    context.addIssue({ code: "custom", path: ["name"], message: PROVIDER_FORM_ERRORS.name });
});

export type ProviderForm = z.input<typeof providerSchema>;

export function toProviderFields(form: ProviderForm) {
  const isOidc = form.type === PROVIDER_TYPES.OIDC;
  const details: Record<string, string> = {
    [PROVIDER_DETAIL_KEYS.clientId]: form.clientId.trim(),
    [PROVIDER_DETAIL_KEYS.clientSecret]: form.clientSecret.trim(),
    [PROVIDER_DETAIL_KEYS.scopes]: form.scopes.trim(),
    ...(isOidc && {
      [PROVIDER_DETAIL_KEYS.issuer]: form.issuer.trim(),
      [PROVIDER_DETAIL_KEYS.authorizeUrl]: form.authorizeUrl.trim(),
      [PROVIDER_DETAIL_KEYS.tokenUrl]: form.tokenUrl.trim(),
      [PROVIDER_DETAIL_KEYS.attributesUrl]: form.attributesUrl.trim(),
      [PROVIDER_DETAIL_KEYS.jwksUri]: form.jwksUri.trim(),
      [PROVIDER_DETAIL_KEYS.attributesRequestMethod]: form.attributesRequestMethod,
    }),
  };
  return {
    ProviderName: isOidc ? form.name.trim() : GOOGLE_PROVIDER_NAME,
    ProviderType: form.type,
    ProviderDetails: details,
    AttributeMapping: Object.fromEntries(form.mapping.map((row) => [row.poolAttribute, row.idpClaim.trim()])),
  };
}

const DEFAULT_ATTRIBUTE_MAPPING = { poolAttribute: EMAIL_ATTRIBUTE, idpClaim: EMAIL_ATTRIBUTE };

// Điền đủ mọi ô cho cả hai loại: ô undefined trông như rỗng nhưng zod báo "expected string"
export function providerFormOf(provider?: IdentityProviderType): ProviderForm {
  const details = provider?.ProviderDetails ?? {};
  return {
    type: provider?.ProviderType === PROVIDER_TYPES.Google ? PROVIDER_TYPES.Google : PROVIDER_TYPES.OIDC,
    name: provider?.ProviderName ?? "",
    clientId: details[PROVIDER_DETAIL_KEYS.clientId] ?? "",
    clientSecret: details[PROVIDER_DETAIL_KEYS.clientSecret] ?? "",
    scopes: details[PROVIDER_DETAIL_KEYS.scopes] ?? DEFAULT_AUTHORIZE_SCOPES,
    issuer: details[PROVIDER_DETAIL_KEYS.issuer] ?? "",
    authorizeUrl: details[PROVIDER_DETAIL_KEYS.authorizeUrl] ?? "",
    tokenUrl: details[PROVIDER_DETAIL_KEYS.tokenUrl] ?? "",
    attributesUrl: details[PROVIDER_DETAIL_KEYS.attributesUrl] ?? "",
    jwksUri: details[PROVIDER_DETAIL_KEYS.jwksUri] ?? "",
    attributesRequestMethod: details[PROVIDER_DETAIL_KEYS.attributesRequestMethod] ?? ATTRIBUTES_REQUEST_METHOD,
    mapping: provider
      ? Object.entries(provider.AttributeMapping ?? {}).map(([poolAttribute, idpClaim]) => ({ poolAttribute, idpClaim }))
      : [DEFAULT_ATTRIBUTE_MAPPING],
  };
}
