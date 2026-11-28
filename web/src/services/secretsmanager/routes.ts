import { SECRET_ARN_MARKER, SECRET_ARN_SUFFIX_LENGTH } from "./constants.ts";

export const SECRETS_SERVICE_ID = "secretsmanager";
const SECRETS_ROOT = `/${SECRETS_SERVICE_ID}`;

// Tên secret có thể có "/" nên đưa vào query string (như ?key= của S3)
export const SEARCH_PARAMS = { name: "name" } as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const SECRETS_ROUTE_PATTERNS = {
  secrets: "secrets",
  createSecret: "secrets/create",
  secret: "secrets/detail",
} as const;

const fullPath = (pattern: string) => `${SECRETS_ROOT}/${pattern}`;

export const secretNameOfArn = (arn: string) =>
  arn.slice(arn.indexOf(SECRET_ARN_MARKER) + SECRET_ARN_MARKER.length, -SECRET_ARN_SUFFIX_LENGTH);

const secret = (name: string) =>
  `${fullPath(SECRETS_ROUTE_PATTERNS.secret)}?${new URLSearchParams({ [SEARCH_PARAMS.name]: name })}`;

export const secretsRoutes = {
  secrets: fullPath(SECRETS_ROUTE_PATTERNS.secrets),
  createSecret: fullPath(SECRETS_ROUTE_PATTERNS.createSecret),
  secret,
  // CloudFormation (physical ID) và RDS (secret rds!…) chỉ có ARN
  secretOfArn: (arn: string) => secret(secretNameOfArn(arn)),
};

export const secretsBaseCrumbs = [
  { text: "AWS Secrets Manager", href: secretsRoutes.secrets },
  { text: "Secrets", href: secretsRoutes.secrets },
];

export const secretCrumbs = (name: string) => [
  ...secretsBaseCrumbs,
  { text: name, href: secretsRoutes.secret(name) },
];
