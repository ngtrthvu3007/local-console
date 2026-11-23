// Chỉ import type từ SDK, không import @shared: tests/it (Task 11) import file này
import type {
  EmailConfigurationType,
  UpdateUserPoolClientRequest,
  UpdateUserPoolRequest,
  UserPoolClientType,
  UserPoolType,
} from "@aws-sdk/client-cognito-identity-provider";
import { SES_IDENTITY_PREFIX } from "./constants.ts";
import type { EmailForm } from "./schemas.ts";

// AWS reset trường không gửi trong Update*, nên phải gửi lại mọi trường request nhận
const UPDATE_USER_POOL_FIELDS = [
  "Policies",
  "DeletionProtection",
  "LambdaConfig",
  "AutoVerifiedAttributes",
  "SmsVerificationMessage",
  "EmailVerificationMessage",
  "EmailVerificationSubject",
  "VerificationMessageTemplate",
  "SmsAuthenticationMessage",
  "UserAttributeUpdateSettings",
  "MfaConfiguration",
  "DeviceConfiguration",
  "EmailConfiguration",
  "SmsConfiguration",
  "UserPoolTags",
  "AdminCreateUserConfig",
  "UserPoolAddOns",
  "DcrConfiguration",
  "AccountRecoverySetting",
  "PoolName",
  "UserPoolTier",
  "KeyConfiguration",
  "IssuerConfiguration",
  "AcrConfiguration",
] as const satisfies readonly Exclude<keyof UpdateUserPoolRequest, "UserPoolId">[];

const UPDATE_USER_POOL_CLIENT_FIELDS = [
  "ClientName",
  "RefreshTokenValidity",
  "AccessTokenValidity",
  "IdTokenValidity",
  "TokenValidityUnits",
  "ReadAttributes",
  "WriteAttributes",
  "ExplicitAuthFlows",
  "SupportedIdentityProviders",
  "CallbackURLs",
  "LogoutURLs",
  "DefaultRedirectURI",
  "AllowedOAuthFlows",
  "AllowedOAuthScopes",
  "AllowedOAuthFlowsUserPoolClient",
  "AnalyticsConfiguration",
  "PreventUserExistenceErrors",
  "EnableTokenRevocation",
  "EnablePropagateAdditionalUserContextData",
  "AuthSessionValidity",
  "RefreshTokenRotation",
] as const satisfies readonly Exclude<
  keyof UpdateUserPoolClientRequest,
  "UserPoolId" | "ClientId"
>[];

// SDK thêm trường mà danh sách thiếu → lỗi biên dịch, không âm thầm reset cấu hình (export để noUnusedLocals bỏ qua)
type AssertNoMissingField<TMissing extends never> = TMissing;

export type UnlistedUserPoolFields = AssertNoMissingField<
  Exclude<keyof UpdateUserPoolRequest, "UserPoolId" | (typeof UPDATE_USER_POOL_FIELDS)[number]>
>;

export type UnlistedUserPoolClientFields = AssertNoMissingField<
  Exclude<
    keyof UpdateUserPoolClientRequest,
    "UserPoolId" | "ClientId" | (typeof UPDATE_USER_POOL_CLIENT_FIELDS)[number]
  >
>;

// Object.entries của interface SDK trả any, nên kết quả gộp được vào request không cần `as`
const pickFields = (source: object, fields: readonly string[]) =>
  Object.fromEntries(Object.entries(source).filter(([field]) => fields.includes(field)));

// AWS từ chối khi có cả UnusedAccountValidityDays (cũ) lẫn TemporaryPasswordValidityDays
function withoutDeprecatedValidityDays(input: UpdateUserPoolRequest): UpdateUserPoolRequest {
  const adminCreateUserConfig = input.AdminCreateUserConfig;

  if (
    input.Policies?.PasswordPolicy?.TemporaryPasswordValidityDays === undefined ||
    adminCreateUserConfig?.UnusedAccountValidityDays === undefined
  )
    return input;

  const { UnusedAccountValidityDays, ...keptConfig } = adminCreateUserConfig;
  return { ...input, AdminCreateUserConfig: keptConfig };
}

export function toUpdateUserPoolInput(
  pool: UserPoolType,
  change: Partial<UpdateUserPoolRequest>,
): UpdateUserPoolRequest {
  return withoutDeprecatedValidityDays({
    ...pickFields(pool, UPDATE_USER_POOL_FIELDS),
    ...change,
    UserPoolId: pool.Id,
  });
}

export function toUpdateUserPoolClientInput(
  client: UserPoolClientType,
  change: Partial<UpdateUserPoolClientRequest>,
): UpdateUserPoolClientRequest {
  return {
    ...pickFields(client, UPDATE_USER_POOL_CLIENT_FIELDS),
    ...change,
    UserPoolId: client.UserPoolId,
    ClientId: client.ClientId,
  };
}

// Giữ ConfigurationSet khi vẫn dùng SES (form không có ô này); chuyển khỏi SES thì bỏ hết như Cognito mặc định
export function toEmailConfiguration(
  form: EmailForm,
  region: string,
  accountId: string,
  current?: EmailConfigurationType,
): EmailConfigurationType {
  if (form.source === "cognito")
    return {
      EmailSendingAccount: "COGNITO_DEFAULT",
      ...(current?.EmailSendingAccount !== "DEVELOPER" &&
        current?.ReplyToEmailAddress && { ReplyToEmailAddress: current.ReplyToEmailAddress }),
    };

  return {
    EmailSendingAccount: "DEVELOPER",
    SourceArn: `arn:aws:ses:${region}:${accountId}:${SES_IDENTITY_PREFIX}${form.identity}`,
    ...(form.from && { From: form.from }),
    ...(form.replyTo && { ReplyToEmailAddress: form.replyTo }),
    ...(current?.ConfigurationSet && { ConfigurationSet: current.ConfigurationSet }),
  };
}
