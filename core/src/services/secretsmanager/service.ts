import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  cancelRotation,
  configureRotation,
  createSecret,
  deleteSecret,
  getSecret,
  getSecretValue,
  listRotatedSecrets,
  listSecrets,
  putSecretValue,
  rotateNow,
  updateDescription,
  type NewSecret,
  type RotationInput,
} from "./operations/secrets.ts";

export function createSecretsService(secrets: SecretsManagerClient) {
  return {
    listSecrets: () => listSecrets(secrets),
    listRotatedSecrets: (functionArn: string) => listRotatedSecrets(secrets, functionArn),
    createSecret: (input: NewSecret) => createSecret(secrets, input),
    deleteSecret: (input: { name: string; recoveryDays: number }) => deleteSecret(secrets, input),
    getSecret: (name: string) => getSecret(secrets, name),
    getSecretValue: (name: string) => getSecretValue(secrets, name),
    putSecretValue: (name: string, value: string) => putSecretValue(secrets, name, value),
    updateDescription: (name: string, description: string) =>
      updateDescription(secrets, name, description),
    configureRotation: (name: string, input: RotationInput) =>
      configureRotation(secrets, name, input),
    cancelRotation: (name: string) => cancelRotation(secrets, name),
    rotateNow: (name: string) => rotateNow(secrets, name),
  };
}

export type SecretsService = ReturnType<typeof createSecretsService>;
