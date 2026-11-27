import { useMemo } from "react";
import { ElastiCacheClient } from "@aws-sdk/client-elasticache";
import { createElastiCacheService } from "@localconsole/core/elasticache";
import { useAwsClient } from "@shared/aws.ts";

export function useElastiCacheService() {
  const elasticache = useAwsClient(ElastiCacheClient);

  return useMemo(() => createElastiCacheService(elasticache), [elasticache]);
}
