import { useMemo } from "react";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createSecretsService } from "@localconsole/core/secretsmanager";
import { useAwsClient } from "@shared/aws.ts";

export function useSecretsService() {
  const secrets = useAwsClient(SecretsManagerClient);

  return useMemo(() => createSecretsService(secrets), [secrets]);
}
