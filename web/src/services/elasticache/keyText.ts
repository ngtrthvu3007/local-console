import type { KeyValue } from "@server/routes/redis/contract.ts";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes, formatDuration, pluralize } from "@shared/format.ts";
import { KEY_TYPE_LABELS } from "./constants.ts";

export const typeLabel = (type: string) => KEY_TYPE_LABELS[type] ?? type;

// Cột TTL: "59m 12s"; không có hạn thì "—"
export const ttlCell = (ttl: number | null) => (ttl === null ? NOT_AVAILABLE : formatDuration(ttl));

const ttlPhrase = (ttl: number | null) =>
  ttl === null ? "No expiry" : `TTL ${formatDuration(ttl)}`;

function sizeText(value: KeyValue) {
  switch (value.kind) {
    case "string":
      return formatBytes(value.length);
    case "hash":
      return pluralize(value.length, "field");
    case "list":
      return pluralize(value.length, "element");
    case "set":
    case "zset":
      return pluralize(value.length, "member");
    default:
      return undefined;
  }
}

// Dòng mô tả của panel: "hash · 3 fields · No expiry"
export const keySummary = (value: KeyValue) =>
  [typeLabel(value.type), sizeText(value), ttlPhrase(value.ttl)]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
