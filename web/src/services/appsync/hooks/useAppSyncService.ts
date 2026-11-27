import { useMemo } from "react";
import { AppSyncClient } from "@aws-sdk/client-appsync";
import { createAppSyncService } from "@localconsole/core/appsync";
import { useAwsClient } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

export function useAppSyncService() {
  const appsync = useAwsClient(AppSyncClient);
  const { region } = useLoadedConfig();

  return useMemo(() => createAppSyncService(appsync, { region }), [appsync, region]);
}
