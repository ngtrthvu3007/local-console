import { MILLISECONDS_PER_SECOND } from "@localconsole/core/shared";

// DB đang đổi trạng thái thì tự tải lại cho tới khi xong
export const DB_REFRESH_INTERVAL_MS = 2 * MILLISECONDS_PER_SECOND;

// Giống AWS: phải gõ đúng chuỗi này mới xóa được
export const CONFIRM_DELETE_DATABASE = "delete me";
