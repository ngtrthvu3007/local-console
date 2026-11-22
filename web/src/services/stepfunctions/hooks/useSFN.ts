import { useMemo } from "react";
import { SFNClient } from "@aws-sdk/client-sfn";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useSFN() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new SFNClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
