import { useMemo } from "react";
import { SNSClient } from "@aws-sdk/client-sns";
import { createSnsService } from "@localconsole/core/sns";
import { proxyEndpoint, useAwsClient } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useSnsService() {
  const sns = useAwsClient(SNSClient);
  const { region } = useLoadedConfig();

  return useMemo(() => createSnsService(sns, { flociUrl: proxyEndpoint(), region }), [sns, region]);
}
