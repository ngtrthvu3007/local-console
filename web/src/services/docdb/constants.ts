import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "@shared/constants.ts";

export const DOCDB_ENGINE = "docdb";
// DocumentDB dùng chung API với RDS: mọi lời gọi lọc theo engine để không lẫn database của RDS
export const ENGINE_FILTER = [{ Name: "engine", Values: [DOCDB_ENGINE] }];
export const DOCDB_PORT = 27017;
// Tên group theo mẫu AWS, để link qua lại với trang CloudWatch Logs
export const DOCDB_LOG_GROUP_PREFIX = "/aws/docdb/cluster/";
export const auditLogGroup = (id: string) => `${DOCDB_LOG_GROUP_PREFIX}${id}/audit`;

export const INSTANCE_CLASSES = ["db.t3.medium", "db.r5.large", "db.r6g.large"] as const;
export const DEFAULT_INSTANCE_CLASS = INSTANCE_CLASSES[0];
export const CLASS_OPTIONS = INSTANCE_CLASSES.map((value) => ({ value, label: value }));
// AWS cho tối đa 16 instance mỗi cluster (1 primary + 15 replica)
export const INSTANCE_COUNT = { min: 1, max: 16, default: 1 } as const;

// Luật của AWS; Floci nhận cả giá trị sai nên form tự kiểm
export const IDENTIFIER_MAX_LENGTH = 63;
// Chữ thường, số, "-"; bắt đầu bằng chữ; không "--", không kết thúc bằng "-"
export const IDENTIFIER_PATTERN = /^[a-z](?!.*--)[a-z0-9-]*(?<!-)$/;
const identifierRule = (max: number) =>
  `Use 1–${max} lowercase letters, numbers or hyphens. Start with a letter; no two hyphens in a row or at the end.`;
export const IDENTIFIER_RULE = identifierRule(IDENTIFIER_MAX_LENGTH);
// Instance tạo kèm cluster tên <cluster>-<n> (n tới INSTANCE_COUNT.max): chừa chỗ cho hậu tố
export const CLUSTER_IDENTIFIER_MAX_LENGTH =
  IDENTIFIER_MAX_LENGTH - `-${INSTANCE_COUNT.max}`.length;
export const CLUSTER_IDENTIFIER_RULE = identifierRule(CLUSTER_IDENTIFIER_MAX_LENGTH);
export const USERNAME_MAX_LENGTH = 63;
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
export const USERNAME_RULE = "Use 1–63 letters or numbers, starting with a letter.";
export const PASSWORD_LENGTH = { min: 8, max: 100 } as const;
// ASCII in được, trừ / " @ (khác RDS: DocumentDB cho phép ' và khoảng trắng)
export const PASSWORD_PATTERN = /^[ !#-.0-?A-~]+$/;
export const PASSWORD_RULE = 'Use 8–100 printable ASCII characters except /, " and @.';

export const CLUSTER_STATUS_STYLES: Record<
  string,
  { label: string; type: StatusIndicatorProps.Type }
> = {
  available: { label: "Available", type: "success" },
  creating: { label: "Creating", type: "in-progress" },
  modifying: { label: "Modifying", type: "in-progress" },
  deleting: { label: "Deleting", type: "pending" },
};

// Cầu nối cho GUI trên máy (Compass, mongosh): Floci không publish cổng MongoDB (spec 7 #4, #12)
export const SOCAT_IMAGE = "alpine/socat:1.8.0.3";
export const FLOCI_CONTAINER_PREFIX = "floci-aws-docdb-";
export const FORWARD_CONTAINER_PREFIX = "docdb-forward-";
export const PASSWORD_PLACEHOLDER = "<password>";
export const USER_PLACEHOLDER = "<user>";

export const TEXT = {
  forwardIntro:
    "Floci doesn't publish this cluster's port. Run this once to forward it to localhost (macOS / Linux shell):",
  forwardNote: (cluster: string) =>
    `Keep 127.0.0.1: it stops other machines on your network from reaching the database. Use another port (27018…) for a second cluster. It keeps working when Floci restarts and you recreate the cluster. Run docker stop ${FORWARD_CONTAINER_PREFIX}${cluster} before docker compose down.`,
  noTls: "No TLS: remove tls=true from a connection string copied from AWS.",
  encodePassword: "Percent-encode special characters in the password (# → %23, : → %3A).",
  // EngineVersion Floci trả về không phải bản MongoDB nó chạy thật
  engine: (version?: string) => `Engine ${version ?? NOT_AVAILABLE} (Floci runs MongoDB 7.0)`,
  restart: "Floci drops DocumentDB containers when it restarts: delete and recreate the cluster.",
  password: "Write the password down: AWS and Floci don't return it.",
  firstCluster: "The first cluster takes about 30 s: Floci downloads MongoDB.",
} as const;
