import { useMemo } from "react";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useSES() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new SESv2Client({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
