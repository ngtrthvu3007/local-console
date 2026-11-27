import type { StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { FORWARD_CONTAINER_PREFIX } from "@localconsole/core/docdb";

export const CLUSTER_STATUS_STYLES: Record<
  string,
  { label: string; type: StatusIndicatorProps.Type }
> = {
  available: { label: "Available", type: "success" },
  creating: { label: "Creating", type: "in-progress" },
  modifying: { label: "Modifying", type: "in-progress" },
  deleting: { label: "Deleting", type: "pending" },
};
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
