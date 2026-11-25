import type { LambdaConfigType } from "@aws-sdk/client-cognito-identity-provider";
import { isArnOrQualified } from "@shared/arn.ts";

type TriggerDefinition = { key: keyof LambdaConfigType; label: string };

// Thứ tự theo spec 3.7
export const LAMBDA_TRIGGERS = [
  { key: "PreSignUp", label: "Pre sign-up" },
  { key: "PostConfirmation", label: "Post confirmation" },
  { key: "PreAuthentication", label: "Pre authentication" },
  { key: "PostAuthentication", label: "Post authentication" },
  { key: "PreTokenGeneration", label: "Pre token generation" },
  { key: "CustomMessage", label: "Custom message" },
  { key: "DefineAuthChallenge", label: "Define auth challenge" },
  { key: "CreateAuthChallenge", label: "Create auth challenge" },
  { key: "VerifyAuthChallengeResponse", label: "Verify auth challenge response" },
  { key: "UserMigration", label: "User migration" },
] as const satisfies readonly TriggerDefinition[];

type TriggerKey = (typeof LAMBDA_TRIGGERS)[number]["key"];

// Custom sender cần KMS: chỉ xem, giữ nguyên khi sửa
const CUSTOM_SENDER_TRIGGERS = [
  { key: "CustomEmailSender", label: "Custom email sender" },
  { key: "CustomSMSSender", label: "Custom SMS sender" },
] as const satisfies readonly TriggerDefinition[];

// "" = None
export type TriggerSelection = Record<TriggerKey, string>;

// Edit thay hẳn các khóa này; khóa khác (custom sender, KMSKeyID…) giữ nguyên
const REPLACED_KEYS: ReadonlySet<string> = new Set([
  ...LAMBDA_TRIGGERS.map(({ key }) => key),
  "PreTokenGenerationConfig" satisfies keyof LambdaConfigType,
]);

// IaC (Terraform, CDK) có thể chỉ đặt bản V2; Floci không chép LambdaArn sang PreTokenGeneration
const triggerArnOf = (config: LambdaConfigType | undefined, key: TriggerKey): string | undefined =>
  key === "PreTokenGeneration"
    ? (config?.PreTokenGenerationConfig?.LambdaArn ?? config?.PreTokenGeneration)
    : config?.[key];

export function poolTriggerRows(
  config?: LambdaConfigType,
): { key: string; label: string; arn?: string; editable: boolean }[] {
  return [
    ...LAMBDA_TRIGGERS.map(({ key, label }) => ({
      key,
      label,
      arn: triggerArnOf(config, key),
      editable: true,
    })),
    ...CUSTOM_SENDER_TRIGGERS.flatMap(({ key, label }) => {
      const arn = config?.[key]?.LambdaArn;
      return arn ? [{ key, label, arn, editable: false }] : [];
    }),
  ];
}

export function triggerSelectionOf(config?: LambdaConfigType): TriggerSelection {
  // fromEntries làm mất kiểu khóa; map trên LAMBDA_TRIGGERS nên đủ mọi TriggerKey
  return Object.fromEntries(
    LAMBDA_TRIGGERS.map(({ key }) => [key, triggerArnOf(config, key) ?? ""]),
  ) as TriggerSelection;
}

export function toLambdaConfig(
  current: LambdaConfigType | undefined,
  selection: TriggerSelection,
): LambdaConfigType {
  const kept = Object.fromEntries(
    Object.entries(current ?? {}).filter(([key]) => !REPLACED_KEYS.has(key)),
  );

  const selected = Object.fromEntries(
    LAMBDA_TRIGGERS.filter(({ key }) => selection[key]).map(({ key }) => [key, selection[key]]),
  );

  const preTokenGenerationArn = selection.PreTokenGeneration;

  // Config V2 (IaC tạo) phải trỏ cùng function với PreTokenGeneration
  const preTokenGenerationConfig =
    current?.PreTokenGenerationConfig && preTokenGenerationArn
      ? { ...current.PreTokenGenerationConfig, LambdaArn: preTokenGenerationArn }
      : undefined;

  return {
    ...kept,
    ...selected,
    ...(preTokenGenerationConfig && { PreTokenGenerationConfig: preTokenGenerationConfig }),
  };
}

// Giữ ARN hiện tại (function đã xóa, có version / alias) làm option để Save không gỡ trigger
export const functionOptionArns = (functionArns: string[], currentArn?: string): string[] =>
  currentArn && !functionArns.includes(currentArn) ? [...functionArns, currentArn] : functionArns;

// ARN trigger có thể kèm version / alias: arn:…:function:fn:prod
export const matchesFunction = isArnOrQualified;

export const triggerLabelsOf = (
  config: LambdaConfigType | undefined,
  functionArn: string,
): string[] =>
  poolTriggerRows(config)
    .filter(({ arn }) => arn && matchesFunction(arn, functionArn))
    .map(({ label }) => label);
