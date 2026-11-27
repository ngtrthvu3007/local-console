import { useMemo } from "react";
import { KinesisClient } from "@aws-sdk/client-kinesis";
import { createKinesisService } from "@localconsole/core/kinesis";
import { useAwsClient } from "@shared/aws.ts";
import { useLambdaService } from "../../lambda/hooks/useLambdaService.ts";

export function useKinesisService() {
  const kinesis = useAwsClient(KinesisClient);
  const lambda = useLambdaService();

  return useMemo(() => createKinesisService(kinesis, { lambda }), [kinesis, lambda]);
}
