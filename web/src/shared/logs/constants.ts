import { MILLISECONDS_PER_SECOND } from "@localconsole/core/shared";

// Mọi query đọc CloudWatch Logs nằm dưới key gốc này
export const LOGS_QUERY_ROOT = "logs";
// Đoạn thứ 2 của key. Quy ước: với mọi loại trừ groups (danh sách theo prefix), đoạn thứ 3 là tên
// group, để xóa group thì bỏ qua đúng query của group đó (useDeleteLogGroups)
export const LOGS_KEYS = {
  groups: "groups",
  group: "group",
  events: "events",
  streams: "streams",
  stream: "stream",
  subscriptions: "subscriptions",
} as const;

export const LOG_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;
