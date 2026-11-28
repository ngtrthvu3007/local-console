import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { useAwsClient } from "@shared/aws.ts";

export const useSecretsManager = () => useAwsClient(SecretsManagerClient);
