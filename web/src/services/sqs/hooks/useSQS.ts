import { useMemo } from "react";
import { SQSClient } from "@aws-sdk/client-sqs";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

// Có endpoint riêng thì SDK không lấy host từ QueueUrl (localhost:4566), nên vẫn đi qua /aws
export function useSQS() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new SQSClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
