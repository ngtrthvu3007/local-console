import { useMemo } from "react";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { createLogsService } from "@localconsole/core/logs";
import { useAwsClient } from "../aws.ts";

export function useLogsService() {
  const logs = useAwsClient(CloudWatchLogsClient);

  return useMemo(() => createLogsService(logs), [logs]);
}
