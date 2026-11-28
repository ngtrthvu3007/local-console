import { useMemo } from "react";
import { ECSClient } from "@aws-sdk/client-ecs";
import { createEcsService } from "@localconsole/core/ecs";
import { useAwsClient } from "@shared/aws.ts";
import { useLogsService } from "@shared/logs/useLogsService.ts";

// Mọi query của ECS nằm dưới key gốc này
export const ECS_QUERY_ROOT = "ecs";

// Query của một cluster (chi tiết, service, task) nằm dưới key này: tải lại cả cụm bằng một key
export const clusterKey = (cluster: string) => [ECS_QUERY_ROOT, "cluster", cluster];

export function useEcsService() {
  const ecs = useAwsClient(ECSClient);
  const logs = useLogsService();

  return useMemo(() => createEcsService(ecs, { logs }), [ecs, logs]);
}
