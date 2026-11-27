import { useMemo } from "react";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { createLambdaService } from "@localconsole/core/lambda";
import { useAwsClient } from "@shared/aws.ts";
import { useLogsService } from "@shared/logs/useLogsService.ts";
import { useSecretsService } from "../../secretsmanager/hooks/useSecretsService.ts";
import { codeDownloadUrl } from "../codeDownload.ts";

export function useLambdaService() {
  const lambda = useAwsClient(LambdaClient);
  const logs = useLogsService();
  const secrets = useSecretsService();

  return useMemo(
    () => createLambdaService(lambda, { logs, secrets, codeUrl: codeDownloadUrl }),
    [lambda, logs, secrets],
  );
}
