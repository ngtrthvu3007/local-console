import { useMemo } from "react";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useEventBridge() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new EventBridgeClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
