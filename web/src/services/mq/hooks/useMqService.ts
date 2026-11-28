import { useMemo } from "react";
import { MqClient } from "@aws-sdk/client-mq";
import { createMqService } from "@localconsole/core/mq";
import { useAwsClient } from "@shared/aws.ts";

export function useMqService() {
  const mq = useAwsClient(MqClient);

  return useMemo(() => createMqService(mq), [mq]);
}
