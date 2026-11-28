import { useMemo } from "react";
import { SQSClient } from "@aws-sdk/client-sqs";
import { createSqsService } from "@localconsole/core/sqs";
import { proxyEndpoint, useAwsClient } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useLambdaService } from "../../lambda/hooks/useLambdaService.ts";

export function useSqsService() {
  // Có endpoint riêng thì SDK không lấy host từ QueueUrl (localhost:4566), nên vẫn đi qua /aws
  const sqs = useAwsClient(SQSClient);
  const lambda = useLambdaService();
  const { region } = useLoadedConfig();

  return useMemo(
    () => createSqsService(sqs, { lambda, flociUrl: proxyEndpoint(), region }),
    [sqs, lambda, region],
  );
}
