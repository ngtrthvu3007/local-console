export const SECRET_NAME_PATTERN = /^[A-Za-z0-9/_+=.@-]+$/;
export const SECRET_NAME_MAX_LENGTH = 512;
// ARN secret: "…:secret:<tên>-<6 ký tự ngẫu nhiên>"
export const SECRET_ARN_MARKER = ":secret:";
export const SECRET_ARN_SUFFIX_LENGTH = 7;

export const SECRET_TYPES = { keyValue: "Key/value", plaintext: "Plaintext" } as const;
export type SecretType = keyof typeof SECRET_TYPES;

export const ROTATION_DAYS = { min: 1, max: 1000 } as const;
export const DEFAULT_ROTATION_DAYS = "30";
export const SCHEDULE_TYPES = { days: "Days", expression: "Schedule expression" } as const;
export const SCHEDULE_EXPRESSION_PATTERN = /^(rate|cron)\(.+\)$/;
export const rotationRate = (days: number) => `rate(${days} days)`;
export const ROTATION_RATE_PATTERN = /^rate\((\d+) days?\)$/;

export const RECOVERY_DAYS = { min: 7, max: 30, default: 7 } as const;

// Floci trả về ngay và chạy 4 bước ở nền (spec 7 #12): lỗi của Lambda không về tới console
export const ROTATION_STARTED_MESSAGE =
  "Rotation started in the background. Refresh to see the new value; if it doesn't change, check the Lambda's logs.";

export const SCHEDULED_FOR_DELETION = "It's scheduled for deletion.";

export const SECRETS_KEY_SERVICE = "secretsmanager";
