import { useMemo } from "react";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useScheduler() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new SchedulerClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
