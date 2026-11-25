import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CancelRotateSecretCommand,
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  RotateSecretCommand,
  UpdateSecretCommand,
  paginateListSecrets,
  type SecretListEntry,
  type SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { matchesFunction } from "../../cognito/triggers.ts";
import { useSecretsManager } from "./useSecretsManager.ts";

// Mọi query của Secrets Manager nằm dưới key gốc này
const SECRETS_QUERY_ROOT = "secretsmanager";
const secretsQueryKey = [SECRETS_QUERY_ROOT, "secrets"];
const secretQueryKey = (name: string) => [SECRETS_QUERY_ROOT, "secret", name];
const VALUE = "value";

// Secret đang chờ xóa không có trong list (mặc định của AWS)
export function useSecrets() {
  const client = useSecretsManager();

  return useQuery({
    queryKey: secretsQueryKey,
    queryFn: async () => {
      const secrets: SecretListEntry[] = [];

      for await (const page of paginateListSecrets({ client }, {})) {
        secrets.push(...(page.SecretList ?? []));
      }

      return secrets;
    },
  });
}

// Tên các secret đang bật rotation bằng function này. ListSecrets của Floci 2.4.0 trả đủ
// RotationLambdaARN (đã kiểm 2026-11-25) nên không cần DescribeSecret từng cái
export async function listRotatedSecrets(client: SecretsManagerClient, functionArn: string) {
  const names: string[] = [];

  for await (const page of paginateListSecrets({ client }, {})) {
    for (const { Name, RotationEnabled, RotationLambdaARN } of page.SecretList ?? []) {
      if (
        Name &&
        RotationEnabled &&
        RotationLambdaARN &&
        matchesFunction(RotationLambdaARN, functionArn)
      )
        names.push(Name);
    }
  }

  return names;
}

interface NewSecret {
  name: string;
  value: string;
  description: string;
  kmsKeyId: string;
}

export function useCreateSecret() {
  const client = useSecretsManager();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, value, description, kmsKeyId }: NewSecret) =>
      client.send(
        new CreateSecretCommand({
          Name: name,
          SecretString: value,
          Description: description || undefined,
          KmsKeyId: kmsKeyId || undefined,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: secretsQueryKey }),
  });
}

export function useDeleteSecret() {
  const client = useSecretsManager();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, recoveryDays }: { name: string; recoveryDays: number }) =>
      client.send(new DeleteSecretCommand({ SecretId: name, RecoveryWindowInDays: recoveryDays })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SECRETS_QUERY_ROOT] }),
  });
}

export function useSecret(name: string) {
  const client = useSecretsManager();

  return useQuery({
    queryKey: secretQueryKey(name),
    queryFn: () => client.send(new DescribeSecretCommand({ SecretId: name })),
    retry: false,
  });
}

// Chỉ đọc khi người dùng bấm Retrieve (giống AWS)
export function useSecretValue(name: string, enabled: boolean) {
  const client = useSecretsManager();

  return useQuery({
    queryKey: [...secretQueryKey(name), VALUE],
    queryFn: () => client.send(new GetSecretValueCommand({ SecretId: name })),
    enabled,
    gcTime: 0,
  });
}

// Sửa xong làm mới cả chi tiết lẫn giá trị (cùng key gốc của secret)
const useSecretMutation = <TInput>(name: string, send: (input: TInput) => Promise<unknown>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: secretQueryKey(name) }),
  });
};

export function usePutSecretValue(name: string) {
  const client = useSecretsManager();

  return useSecretMutation(name, (value: string) =>
    client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value })),
  );
}

export function useUpdateDescription(name: string) {
  const client = useSecretsManager();

  return useSecretMutation(name, (description: string) =>
    client.send(new UpdateSecretCommand({ SecretId: name, Description: description })),
  );
}

// RotateImmediately false: chỉ lưu cấu hình, không đổi giá trị ngoài ý muốn
export function useConfigureRotation(name: string) {
  const client = useSecretsManager();

  return useSecretMutation(
    name,
    ({ lambdaArn, scheduleExpression }: { lambdaArn: string; scheduleExpression: string }) =>
      client.send(
        new RotateSecretCommand({
          SecretId: name,
          RotationLambdaARN: lambdaArn,
          RotationRules: { ScheduleExpression: scheduleExpression },
          RotateImmediately: false,
        }),
      ),
  );
}

export function useCancelRotation(name: string) {
  const client = useSecretsManager();

  return useSecretMutation(name, () =>
    client.send(new CancelRotateSecretCommand({ SecretId: name })),
  );
}

// Không tham số: xoay ngay bằng Lambda và lịch đã lưu
export function useRotateNow(name: string) {
  const client = useSecretsManager();

  return useSecretMutation(name, () => client.send(new RotateSecretCommand({ SecretId: name })));
}
