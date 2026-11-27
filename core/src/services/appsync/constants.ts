import type { AuthenticationType, DataSourceType } from "@aws-sdk/client-appsync";

// Pool Cognito làm auth mặc định: user đăng nhập được gọi mọi field (như AWS console tạo)
export const COGNITO_DEFAULT_ACTION = "ALLOW";

// Ba kiểu auth console tạo, sửa và gọi được (spec 2); OIDC / Lambda authorizer chỉ hiện
export const AUTH_TYPES = {
  apiKey: "API_KEY",
  cognito: "AMAZON_COGNITO_USER_POOLS",
  iam: "AWS_IAM",
} as const satisfies Record<string, AuthenticationType>;
export type AuthType = (typeof AUTH_TYPES)[keyof typeof AUTH_TYPES];
export const EDITABLE_AUTH_TYPES: readonly string[] = Object.values(AUTH_TYPES);

export const AUTH_LABELS: Record<string, string> = {
  API_KEY: "API key",
  AMAZON_COGNITO_USER_POOLS: "Cognito user pool",
  AWS_IAM: "AWS IAM",
  OPENID_CONNECT: "OpenID Connect",
  AWS_LAMBDA: "Lambda",
};

// Auth phụ chỉ gọi được field có directive tương ứng (luật AppSync)
export const AUTH_DIRECTIVES: Record<string, string> = {
  API_KEY: "@aws_api_key",
  // Floci từ chối directive này khi không có cognito_groups (spec 7 #10)
  AMAZON_COGNITO_USER_POOLS: "@aws_cognito_user_pools(cognito_groups: [...])",
  AWS_IAM: "@aws_iam",
};

// Thông báo cho mã lỗi của query (spec 3.6); lỗi khác hiện nguyên response
export const QUERY_ALERTS = {
  unauthorized: "Not authorized: check the key or sign in again.",
  noSchema: "Save a schema first.",
  subscription: "Floci doesn't support subscriptions.",
  signInExpired: "Your sign-in expired: sign in again.",
};

// HTTP / RDS Floci tạo được nhưng không chạy khi query (spec 7 #6): form chỉ có ba loại này
export const DATA_SOURCE_TYPES = {
  none: "NONE",
  dynamodb: "AMAZON_DYNAMODB",
  lambda: "AWS_LAMBDA",
} as const satisfies Record<string, DataSourceType>;
export type DataSourceKind = (typeof DATA_SOURCE_TYPES)[keyof typeof DATA_SOURCE_TYPES];

export const isDataSourceKind = (type?: string): type is DataSourceKind =>
  Object.values<string | undefined>(DATA_SOURCE_TYPES).includes(type);

export const DATA_SOURCE_LABELS: Record<string, string> = {
  NONE: "None",
  AMAZON_DYNAMODB: "DynamoDB table",
  AWS_LAMBDA: "Lambda function",
  HTTP: "HTTP",
  RELATIONAL_DATABASE: "Relational database",
};

// Floci không chạy Lambda direct resolver (spec 7 #6)
export const LAMBDA_INVOKE_NOTE =
  "Floci passes arguments to Lambda only through an Invoke request; a resolver without code gets an empty event.";

export const RUNTIMES = { js: "js", vtl: "vtl" } as const;
export type Runtime = (typeof RUNTIMES)[keyof typeof RUNTIMES];
export const RUNTIME_LABELS: Record<Runtime, string> = { js: "JS", vtl: "VTL" };
// Runtime JS duy nhất của AppSync
export const JS_RUNTIME = { name: "APPSYNC_JS", runtimeVersion: "1.0.0" } as const;

// Phiên bản template VTL duy nhất của AppSync; function VTL bắt buộc có
export const VTL_VERSION = "2018-05-29";

export const RESOLVER_KINDS = { unit: "UNIT", pipeline: "PIPELINE" } as const;

// AWS: hạn API key 1–365 ngày; Floci mặc định 7 ngày và từ chối dưới 1 ngày (spec 7 #9)
export const API_KEY_DAYS = { min: 1, max: 365, default: 7 } as const;

// Floci lưu schema trong ~1 giây (spec 7 #3)
export const SCHEMA_POLL = { intervalMs: 1000, timeoutMs: 30_000 } as const;
export const SCHEMA_STATUS = { success: "SUCCESS", failed: "FAILED" } as const;

// Luật tên của AWS
export const API_NAME_MAX_LENGTH = 65;
export const API_NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

// Type gốc của GraphQL, đứng đầu bảng Resolvers
export const ROOT_TYPES = ["Query", "Mutation", "Subscription"];

export const SCHEMA_TIMEOUT = "Floci is still processing the schema. Refresh in a moment.";
