import { useMemo } from "react";
import { ElastiCacheClient } from "@aws-sdk/client-elasticache";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useElastiCache() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new ElastiCacheClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
