import { MILLISECONDS_PER_SECOND } from "@shared/constants.ts";

// Chỉ RDS instance PostgreSQL / MySQL (spec: không làm Aurora)
export const ENGINE_LABELS = { postgres: "PostgreSQL", mysql: "MySQL" } as const;
export type Engine = keyof typeof ENGINE_LABELS;
export const DEFAULT_ENGINE: Engine = "postgres";
// Master username mặc định theo engine, như Easy create của AWS
export const DEFAULT_USERNAMES: Record<Engine, string> = { postgres: "postgres", mysql: "admin" };
// Không đặt initial database: Postgres vẫn có DB "postgres", MySQL thì không có DB nào
export const DEFAULT_DATABASES: Record<Engine, string | undefined> = {
  postgres: "postgres",
  mysql: undefined,
};
export const URL_SCHEMES: Record<Engine, string> = { postgres: "postgresql", mysql: "mysql" };

// AWS bắt buộc class và dung lượng; ở local không có ý nghĩa nên cố định
export const DB_INSTANCE_CLASS = "db.t3.micro";
export const ALLOCATED_STORAGE_GB = 20;

// Luật tên của RDS
export const IDENTIFIER_MAX_LENGTH = 63;
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
export const DOUBLE_HYPHEN = "--";
export const HYPHEN = "-";
export const USERNAME_MAX_LENGTH = 16;
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTHS: Record<Engine, number> = { postgres: 128, mysql: 41 };
// ASCII in được, trừ / ' " @ và dấu cách
export const PASSWORD_PATTERN = /^[!#-&(-.0-?A-~]+$/;
export const PASSWORD_RULE = "Use printable ASCII characters except / ' \" @ and spaces.";
export const DATABASE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export const CREDENTIAL_TYPES = {
  selfManaged: "Self managed",
  secretsManager: "Managed in AWS Secrets Manager",
} as const;

export const DB_STATUSES = {
  available: "available",
  stopped: "stopped",
  deleting: "deleting",
} as const;
export const FAILED_STATUSES = ["failed", "storage-full", "incompatible-parameters"];
// DB đang đổi trạng thái thì tự tải lại cho tới khi xong
export const DB_REFRESH_INTERVAL_MS = 2 * MILLISECONDS_PER_SECOND;

// Giống AWS: phải gõ đúng chuỗi này mới xóa được
export const CONFIRM_DELETE_DATABASE = "delete me";

// Floci tự ghi stdout của DB vào group này (spec 7 #5)
export const errorLogGroup = (id: string) => `/aws/rds/instance/${id}/error`;

// Tên service trong alias key AWS managed: alias/aws/rds
export const RDS_KEY_SERVICE = "rds";
