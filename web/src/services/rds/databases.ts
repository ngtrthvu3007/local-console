import type { DBInstance } from "@aws-sdk/client-rds";
import { DB_STATUSES, ENGINE_LABELS, FAILED_STATUSES, type Engine } from "./constants.ts";

export const isSupportedEngine = (engine?: string): engine is Engine =>
  Boolean(engine && engine in ENGINE_LABELS);

// "PostgreSQL 16.4"; DB tạo bằng CloudFormation không có version (spec 7 #13)
export const engineText = (database: DBInstance) =>
  [
    isSupportedEngine(database.Engine) ? ENGINE_LABELS[database.Engine] : database.Engine,
    database.EngineVersion,
  ]
    .filter(Boolean)
    .join(" ");

export const isTransitional = (database: DBInstance) => {
  const status = database.DBInstanceStatus ?? "";
  return (
    status !== DB_STATUSES.available &&
    status !== DB_STATUSES.stopped &&
    !FAILED_STATUSES.includes(status)
  );
};

// "storage-full" → "Storage full", như AWS console
export const statusLabel = (status: string) =>
  (status.charAt(0).toUpperCase() + status.slice(1)).replaceAll("-", " ");

export interface Address {
  host: string;
  port: number;
}

export const addressText = (address: Address) => `${address.host}:${address.port}`;

export const endpointOf = (database: DBInstance): Address | undefined => {
  const { Address: host, Port: port } = database.Endpoint ?? {};
  return host && port ? { host, port } : undefined;
};

// Endpoint Floci trả là IP trong mạng compose; máy dev vào qua cổng compose mở trên host của Floci
export const machineAddress = (flociPublicUrl: string, port?: number): Address | undefined =>
  port ? { host: new URL(flociPublicUrl).hostname, port } : undefined;
