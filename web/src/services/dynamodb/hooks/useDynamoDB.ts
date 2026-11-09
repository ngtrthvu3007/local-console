import { useMemo } from "react";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useDynamoDB() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new DynamoDBClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
