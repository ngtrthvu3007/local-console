import {
  CancelKeyDeletionCommand,
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
  EnableKeyCommand,
  GetKeyPolicyCommand,
  ScheduleKeyDeletionCommand,
  UpdateKeyDescriptionCommand,
  paginateListAliases,
  paginateListKeys,
  type KMSClient,
  type KeyMetadata,
} from "@aws-sdk/client-kms";
import { collectPages } from "#shared/aws/pagination.ts";
import { existsUnlessMissing } from "#shared/aws/errors.ts";
import { errorMessage } from "#shared/utils/errorMessage.ts";
import { prettyJson } from "#shared/utils/json.ts";
import type { KeyManager } from "#services/kms/constants.ts";
import {
  KEY_ACTIONS,
  aliasesOf,
  isKeyMissing,
  keyOptions,
  type KeyAction,
} from "#services/kms/keys.ts";
import type { NewKey } from "#services/kms/schemas.ts";

export interface KeyRow {
  meta: KeyMetadata;
  aliases: string[];
}

export interface KeyActionInput {
  keyId: string;
  action: KeyAction;
  days?: number;
}

// Key chỉ có policy tên "default"
const DEFAULT_POLICY = "default";

const listKeyEntries = (kms: KMSClient) =>
  collectPages(paginateListKeys({ client: kms }, {}), (page) => page.Keys);

export const listAliases = (kms: KMSClient, keyId?: string) =>
  collectPages(paginateListAliases({ client: kms }, { KeyId: keyId }), (page) => page.Aliases);

const describeKey = async (kms: KMSClient, key: string) =>
  (await kms.send(new DescribeKeyCommand({ KeyId: key }))).KeyMetadata;

// ListKeys không có trạng thái / loại: local ít key (~30 kể cả AWS managed) nên DescribeKey từng key, song song
export async function listKeys(kms: KMSClient, manager: KeyManager): Promise<KeyRow[]> {
  const [entries, aliases] = await Promise.all([listKeyEntries(kms), listAliases(kms)]);
  const metas = await Promise.all(entries.map(({ KeyId = "" }) => describeKey(kms, KeyId)));

  return metas.flatMap((meta): KeyRow[] =>
    meta?.KeyId && meta.KeyManager === manager
      ? [{ meta, aliases: aliasesOf(aliases, meta.KeyId) }]
      : [],
  );
}

export async function getKey(kms: KMSClient, key: string): Promise<KeyRow | null> {
  try {
    const meta = await describeKey(kms, key);
    if (!meta?.KeyId) return null;
    return { meta, aliases: aliasesOf(await listAliases(kms, meta.KeyId), meta.KeyId) };
  } catch (error) {
    if (isKeyMissing(error)) return null;
    throw error;
  }
}

export const keyExists = (kms: KMSClient, key: string) =>
  existsUnlessMissing(() => describeKey(kms, key), isKeyMissing);

export function keyAction(kms: KMSClient, { keyId, action, days }: KeyActionInput) {
  switch (action) {
    case KEY_ACTIONS.enable:
      return kms.send(new EnableKeyCommand({ KeyId: keyId }));
    case KEY_ACTIONS.disable:
      return kms.send(new DisableKeyCommand({ KeyId: keyId }));
    case KEY_ACTIONS.scheduleDeletion:
      return kms.send(new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: days }));
    case KEY_ACTIONS.cancelDeletion:
      return kms.send(new CancelKeyDeletionCommand({ KeyId: keyId }));
  }
}

export async function getKeyPolicy(kms: KMSClient, keyId: string) {
  const { Policy = "" } = await kms.send(
    new GetKeyPolicyCommand({ KeyId: keyId, PolicyName: DEFAULT_POLICY }),
  );
  return prettyJson(JSON.parse(Policy));
}

export const updateDescription = (
  kms: KMSClient,
  { keyId, description }: { keyId: string; description: string },
) => kms.send(new UpdateKeyDescriptionCommand({ KeyId: keyId, Description: description }));

export async function createKey(kms: KMSClient, { usage, spec, alias, description }: NewKey) {
  const { KeyMetadata } = await kms.send(
    new CreateKeyCommand({
      KeyUsage: usage,
      KeySpec: spec,
      Description: description || undefined,
    }),
  );
  const keyId = KeyMetadata?.KeyId;
  if (!keyId) throw new Error("Floci didn't return a key ID.");
  if (!alias) return { keyId };

  // Key đã tạo: alias lỗi thì vẫn mở key và báo riêng, kẻo người dùng tạo lại thêm key
  try {
    await kms.send(new CreateAliasCommand({ AliasName: alias, TargetKeyId: keyId }));
    return { keyId };
  } catch (error) {
    return { keyId, aliasError: errorMessage(error) };
  }
}

export async function listKeyOptions(kms: KMSClient) {
  const [keys, aliases] = await Promise.all([listKeyEntries(kms), listAliases(kms)]);
  return keyOptions(keys, aliases);
}
