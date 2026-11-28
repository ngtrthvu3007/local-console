import { useMemo } from "react";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { createSesService } from "@localconsole/core/ses";
import { proxyEndpoint, useAwsClient } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useSesService() {
  const ses = useAwsClient(SESv2Client);
  const { region } = useLoadedConfig();

  return useMemo(() => createSesService(ses, { flociUrl: proxyEndpoint(), region }), [ses, region]);
}
