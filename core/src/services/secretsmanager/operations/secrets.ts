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
  type SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { collectPages } from "#shared/aws/pagination.ts";
import { isArnOrQualified } from "#shared/utils/arn.ts";

export interface NewSecret {
  name: string;
  value: string;
  description: string;
  kmsKeyId: string;
}

export interface RotationInput {
  lambdaArn: string;
  scheduleExpression: string;
}

// Secret đang chờ xóa không có trong list (mặc định của AWS)
export const listSecrets = (secrets: SecretsManagerClient) =>
  collectPages(paginateListSecrets({ client: secrets }, {}), (page) => page.SecretList);

// Tên các secret đang bật rotation bằng function này. ListSecrets của Floci 2.4.0 trả đủ
// RotationLambdaARN (đã kiểm 2026-11-25) nên không cần DescribeSecret từng cái
export const listRotatedSecrets = async (secrets: SecretsManagerClient, functionArn: string) =>
  (await listSecrets(secrets)).flatMap(({ Name, RotationEnabled, RotationLambdaARN }) =>
    Name && RotationEnabled && RotationLambdaARN && isArnOrQualified(RotationLambdaARN, functionArn)
      ? [Name]
      : [],
  );

export const createSecret = (
  secrets: SecretsManagerClient,
  { name, value, description, kmsKeyId }: NewSecret,
) =>
  secrets.send(
    new CreateSecretCommand({
      Name: name,
      SecretString: value,
      Description: description || undefined,
      KmsKeyId: kmsKeyId || undefined,
    }),
  );

export const deleteSecret = (
  secrets: SecretsManagerClient,
  { name, recoveryDays }: { name: string; recoveryDays: number },
) => secrets.send(new DeleteSecretCommand({ SecretId: name, RecoveryWindowInDays: recoveryDays }));

export const getSecret = (secrets: SecretsManagerClient, name: string) =>
  secrets.send(new DescribeSecretCommand({ SecretId: name }));

export const getSecretValue = (secrets: SecretsManagerClient, name: string) =>
  secrets.send(new GetSecretValueCommand({ SecretId: name }));

export const putSecretValue = (secrets: SecretsManagerClient, name: string, value: string) =>
  secrets.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }));

export const updateDescription = (
  secrets: SecretsManagerClient,
  name: string,
  description: string,
) => secrets.send(new UpdateSecretCommand({ SecretId: name, Description: description }));

// RotateImmediately false: chỉ lưu cấu hình, không đổi giá trị ngoài ý muốn
export const configureRotation = (
  secrets: SecretsManagerClient,
  name: string,
  { lambdaArn, scheduleExpression }: RotationInput,
) =>
  secrets.send(
    new RotateSecretCommand({
      SecretId: name,
      RotationLambdaARN: lambdaArn,
      RotationRules: { ScheduleExpression: scheduleExpression },
      RotateImmediately: false,
    }),
  );

export const cancelRotation = (secrets: SecretsManagerClient, name: string) =>
  secrets.send(new CancelRotateSecretCommand({ SecretId: name }));

// Không tham số: xoay ngay bằng Lambda và lịch đã lưu
export const rotateNow = (secrets: SecretsManagerClient, name: string) =>
  secrets.send(new RotateSecretCommand({ SecretId: name }));
