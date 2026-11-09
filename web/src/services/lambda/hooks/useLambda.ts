import { useMemo } from "react";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useLambda() {
  const config = useLoadedConfig();
  return useMemo(() => {
    const shared = {
      region: config.region,
      credentials: AWS_TEST_CREDENTIALS,
      endpoint: proxyEndpoint(),
    };
    return { lambda: new LambdaClient(shared), logs: new CloudWatchLogsClient(shared) };
  }, [config]);
}
