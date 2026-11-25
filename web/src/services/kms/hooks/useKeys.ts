import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CancelKeyDeletionCommand,
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
  EnableKeyCommand,
  GetKeyPolicyCommand,
  KMSClient,
  ScheduleKeyDeletionCommand,
  UpdateKeyDescriptionCommand,
  paginateListAliases,
  paginateListKeys,
  type AliasListEntry,
  type KeyListEntry,
  type KeyMetadata,
} from "@aws-sdk/client-kms";
import { existsUnlessMissing } from "@shared/aws.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import type { KeyManager } from "../constants.ts";
import type { NewKey } from "../schemas.ts";
import { KEY_ACTIONS, aliasesOf, isKeyMissing, keyOptions, type KeyAction } from "../keys.ts";
import { useKMS } from "./useKMS.ts";

// Mọi query của KMS nằm dưới key gốc này
export const KMS_QUERY_ROOT = "kms";
const keysQueryKey = (manager: KeyManager) => [KMS_QUERY_ROOT, "keys", manager];
const keyQueryKey = (key: string) => [KMS_QUERY_ROOT, "key", key];

export interface KeyRow {
  meta: KeyMetadata;
  aliases: string[];
}

export async function listKeyEntries(client: KMSClient) {
  const keys: KeyListEntry[] = [];
  for await (const page of paginateListKeys({ client }, {})) keys.push(...(page.Keys ?? []));
  return keys;
}

export async function listAliasEntries(client: KMSClient, keyId?: string) {
  const aliases: AliasListEntry[] = [];
  for await (const page of paginateListAliases({ client }, { KeyId: keyId })) {
    aliases.push(...(page.Aliases ?? []));
  }
  return aliases;
}

const describeKey = async (client: KMSClient, key: string) =>
  (await client.send(new DescribeKeyCommand({ KeyId: key }))).KeyMetadata;

// ListKeys không có trạng thái / loại: local ít key (~30 kể cả AWS managed) nên DescribeKey từng key, song song
export function useKeys(manager: KeyManager) {
  const client = useKMS();

  return useQuery({
    queryKey: keysQueryKey(manager),
    queryFn: async () => {
      const [entries, aliases] = await Promise.all([
        listKeyEntries(client),
        listAliasEntries(client),
      ]);
      const metas = await Promise.all(entries.map(({ KeyId = "" }) => describeKey(client, KeyId)));

      return metas.flatMap((meta): KeyRow[] =>
        meta?.KeyId && meta.KeyManager === manager
          ? [{ meta, aliases: aliasesOf(aliases, meta.KeyId) }]
          : [],
      );
    },
  });
}

// null = không có key. key là ID, ARN, alias hoặc ARN alias
export function useKey(key: string) {
  const client = useKMS();

  return useQuery({
    queryKey: keyQueryKey(key),
    retry: false,
    queryFn: async (): Promise<KeyRow | null> => {
      try {
        const meta = await describeKey(client, key);
        if (!meta?.KeyId) return null;
        return { meta, aliases: aliasesOf(await listAliasEntries(client, meta.KeyId), meta.KeyId) };
      } catch (error) {
        if (isKeyMissing(error)) return null;
        throw error;
      }
    },
  });
}

// Floci báo key không có bằng NotFoundException + HTTP 400 nên phải truyền isKeyMissing
export function useKeyExists(key: string) {
  const client = useKMS();

  return useQuery({
    queryKey: [...keyQueryKey(key), "exists"],
    queryFn: () => existsUnlessMissing(() => describeKey(client, key), isKeyMissing),
    retry: false,
  });
}

export interface KeyActionInput {
  keyId: string;
  action: KeyAction;
  days?: number;
}

export function useKeyAction() {
  const client = useKMS();
  const queryClient = useQueryClient();

  const send = ({ keyId, action, days }: KeyActionInput) => {
    switch (action) {
      case KEY_ACTIONS.enable:
        return client.send(new EnableKeyCommand({ KeyId: keyId }));
      case KEY_ACTIONS.disable:
        return client.send(new DisableKeyCommand({ KeyId: keyId }));
      case KEY_ACTIONS.scheduleDeletion:
        return client.send(
          new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: days }),
        );
      case KEY_ACTIONS.cancelDeletion:
        return client.send(new CancelKeyDeletionCommand({ KeyId: keyId }));
    }
  };

  return useMutation({
    mutationFn: send,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

// Key chỉ có policy tên "default"
const DEFAULT_POLICY = "default";
const JSON_INDENT = 2;

export function useKeyPolicy(keyId: string) {
  const client = useKMS();

  return useQuery({
    queryKey: [...keyQueryKey(keyId), "policy"],
    queryFn: async () => {
      const { Policy = "" } = await client.send(
        new GetKeyPolicyCommand({ KeyId: keyId, PolicyName: DEFAULT_POLICY }),
      );
      return JSON.stringify(JSON.parse(Policy), null, JSON_INDENT);
    },
  });
}

export function useUpdateDescription() {
  const client = useKMS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, description }: { keyId: string; description: string }) =>
      client.send(new UpdateKeyDescriptionCommand({ KeyId: keyId, Description: description })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

// Tạo key rồi đặt alias (nếu có); trả KeyId để mở trang chi tiết
export function useCreateKey() {
  const client = useKMS();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ usage, spec, alias, description }: NewKey) => {
      const { KeyMetadata } = await client.send(
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
        await client.send(new CreateAliasCommand({ AliasName: alias, TargetKeyId: keyId }));
        return { keyId };
      } catch (error) {
        return { keyId, aliasError: errorMessage(error) };
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KMS_QUERY_ROOT] }),
  });
}

// Ô chọn key của service khác: chỉ ListKeys + ListAliases, không DescribeKey từng key
export function useKeyOptions() {
  const client = useKMS();
  return useQuery({
    queryKey: [KMS_QUERY_ROOT, "options"],
    queryFn: async () => {
      const [keys, aliases] = await Promise.all([listKeyEntries(client), listAliasEntries(client)]);
      return keyOptions(keys, aliases);
    },
  });
}
