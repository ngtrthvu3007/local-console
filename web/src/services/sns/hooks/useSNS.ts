import { useMemo } from "react";
import { SNSClient } from "@aws-sdk/client-sns";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useSNS() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new SNSClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
