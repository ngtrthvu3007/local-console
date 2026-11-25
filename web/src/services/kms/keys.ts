import type { AliasListEntry, KeyListEntry, KeyMetadata } from "@aws-sdk/client-kms";
import type { KeyValue } from "@shared/components/KeyValueEditor.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { fromBase64 } from "../dynamodb/itemJson.ts";
import {
  ALIAS_PREFIX,
  AWS_ALIAS_PREFIX,
  KEY_STATES,
  KEY_USAGE_LABELS,
  KMS_NOT_FOUND_ERROR,
  SYMMETRIC_SPEC,
} from "./constants.ts";

const KEY_ARN_MARKER = ":key/";
const ALIAS_ARN_MARKER = ":alias/";
const PEM_LINE_LENGTH = 64;
const PEM_HEADER = "-----BEGIN PUBLIC KEY-----";
const PEM_FOOTER = "-----END PUBLIC KEY-----";
const WHITESPACE = /\s/g;

// ARN key → ID; ID / alias giữ nguyên
const keyIdOf = (value: string) => value.split(KEY_ARN_MARKER)[1] ?? value;

// Nhãn ngắn cho giá trị service khác lưu: alias giữ nguyên, ARN alias → alias, ARN key → ID
export function keyLabel(value: string): string {
  const alias = value.split(ALIAS_ARN_MARKER)[1];
  if (alias) return `${ALIAS_PREFIX}${alias}`;
  return keyIdOf(value);
}

export const aliasesOf = (aliases: readonly AliasListEntry[], keyId: string) =>
  aliases.flatMap(({ AliasName, TargetKeyId }) =>
    AliasName && TargetKeyId === keyId ? [AliasName] : [],
  );

export const normalizeAlias = (input: string) => {
  const name = input.trim();
  return name.startsWith(ALIAS_PREFIX) ? name : `${ALIAS_PREFIX}${name}`;
};

// Như AWS Console: key đối xứng ghi "Symmetric", key khác ghi KeySpec
export const keyTypeLabel = (meta: Pick<KeyMetadata, "KeySpec">) =>
  meta.KeySpec === SYMMETRIC_SPEC ? "Symmetric" : (meta.KeySpec ?? NOT_AVAILABLE);

export const keyUsageLabel = (usage?: string) =>
  (usage && KEY_USAGE_LABELS[usage]) || NOT_AVAILABLE;

const isAwsManagedAlias = (name: string) => name.startsWith(AWS_ALIAS_PREFIX);

export function derToPem(base64Der: string): string {
  const lines = base64Der.match(new RegExp(`.{1,${PEM_LINE_LENGTH}}`, "g")) ?? [];
  return [PEM_HEADER, ...lines, PEM_FOOTER].join("\n");
}

// Ciphertext / chữ ký dán vào thường có xuống dòng, khoảng trắng
export function parseBase64(text: string): Uint8Array {
  try {
    return fromBase64(text.replace(WHITESPACE, ""));
  } catch {
    throw new Error("Not valid base64.");
  }
}

export const KEY_ACTIONS = {
  enable: "enable",
  disable: "disable",
  scheduleDeletion: "scheduleDeletion",
  cancelDeletion: "cancelDeletion",
} as const;
export type KeyAction = (typeof KEY_ACTIONS)[keyof typeof KEY_ACTIONS];

// Giống AWS: khóa action không hợp lệ với trạng thái
export const ACTION_ALLOWED: Record<KeyAction, (state: string) => boolean> = {
  enable: (state) => state === KEY_STATES.disabled,
  disable: (state) => state === KEY_STATES.enabled,
  scheduleDeletion: (state) => state === KEY_STATES.enabled || state === KEY_STATES.disabled,
  cancelDeletion: (state) => state === KEY_STATES.pendingDeletion,
};

export const isKeyMissing = (error: unknown) =>
  (error as { name?: string } | undefined)?.name === KMS_NOT_FOUND_ERROR;

export interface KeyOption {
  value: string;
  label: string;
  description?: string;
}

// Ô chọn key ở service khác: mỗi key customer managed một option, nhãn alias đầu tiên hoặc ID.
// Key có alias alias/aws/… là key AWS managed: đã là option mặc định của service nên bỏ
export function keyOptions(
  keys: readonly KeyListEntry[],
  aliases: readonly AliasListEntry[],
): KeyOption[] {
  const awsManaged = new Set(
    aliases.flatMap(({ AliasName, TargetKeyId }) =>
      AliasName && TargetKeyId && isAwsManagedAlias(AliasName) ? [TargetKeyId] : [],
    ),
  );

  // ListKeys đã trả ARN của key: dùng thẳng, không tự dựng từ region + account
  return keys.flatMap(({ KeyId, KeyArn }) => {
    if (!KeyId || !KeyArn || awsManaged.has(KeyId)) return [];
    const [alias] = aliasesOf(aliases, KeyId);
    return [{ value: KeyArn, label: alias ?? KeyId, description: alias && KeyId }];
  });
}

// Encryption context từ các dòng có key; không dòng nào thì không gửi (undefined)
export function contextOf(entries: readonly KeyValue[]): Record<string, string> | undefined {
  const filled = entries.filter(({ key }) => key.trim());
  return filled.length
    ? Object.fromEntries(filled.map(({ key, value }) => [key.trim(), value]))
    : undefined;
}

// Nhãn option mặc định của ô chọn key / dòng "KMS key" khi resource không đặt key: "aws/sqs (default)"
export const defaultKeyLabel = (service: string) => `aws/${service} (default)`;

// Floci trả RSAES_OAEP_SHA_1 trước SHA_256: chọn SHA_256 như khuyến nghị của AWS (Try it và Connect card)
const PREFERRED_RSA_ALGORITHM = "RSAES_OAEP_SHA_256";
export const preferredRsaAlgorithm = <T extends string>(algorithms: readonly T[]) =>
  algorithms.find((algorithm) => algorithm === PREFERRED_RSA_ALGORITHM) ?? algorithms[0];

// Alias key AWS managed của service: alias/aws/sqs
export const awsManagedAlias = (service: string) => `${AWS_ALIAS_PREFIX}${service}`;
