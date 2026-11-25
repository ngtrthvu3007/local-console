import { useState } from "react";
import { z } from "zod";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { readStorage, writeStorage } from "@shared/storage.ts";
import type { QueryDraft } from "../components/QueriesTab.tsx";

const STORAGE_PREFIX = "appsync-query";
const DEFAULT_DRAFT: QueryDraft = { query: "query {\n  __typename\n}", variables: "" };
const savedQuerySchema = z.object({ query: z.string(), variables: z.string() });

export const queryStorageKey = (region: string, apiId: string) =>
  `${STORAGE_PREFIX}:${region}:${apiId}`;

// Query gần nhất của mỗi API (như test event của Lambda); mất khi xóa dữ liệu trình duyệt cũng không sao
function readSavedQuery(key: string): QueryDraft {
  try {
    return savedQuerySchema.parse(JSON.parse(readStorage(key) ?? ""));
  } catch {
    return DEFAULT_DRAFT;
  }
}

// Lưu mỗi lần đổi (không chỉ khi Run): rời trang rồi quay lại vẫn còn query đang gõ
export function useQueryDraft(apiId: string) {
  const { region } = useLoadedConfig();
  const key = queryStorageKey(region, apiId);
  const [draft, setDraft] = useState(() => readSavedQuery(key));

  const update = (next: QueryDraft) => {
    setDraft(next);
    writeStorage(key, JSON.stringify(next));
  };
  return [draft, update] as const;
}
