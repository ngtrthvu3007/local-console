import { useMemo } from "react";
import { MqClient } from "@aws-sdk/client-mq";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useMQ() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new MqClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
