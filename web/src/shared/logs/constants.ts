import {
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "../constants.ts";

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

export const LOG_RANGES = [
  { id: "15m", text: "15m", milliseconds: 15 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND },
  { id: "1h", text: "1h", milliseconds: SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND },
  { id: "1d", text: "1d", milliseconds: SECONDS_PER_DAY * MILLISECONDS_PER_SECOND },
  { id: "7d", text: "7d", milliseconds: 7 * SECONDS_PER_DAY * MILLISECONDS_PER_SECOND },
] as const;

export type LogRangeId = (typeof LOG_RANGES)[number]["id"];
export const DEFAULT_LOG_RANGE: LogRangeId = "1h";
export const LOG_REFRESH_INTERVAL_MS = 5 * MILLISECONDS_PER_SECOND;
