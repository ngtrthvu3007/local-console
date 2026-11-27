import { useCallback, useState } from "react";
import { readStorage, writeStorage } from "@shared/storage.ts";

// AWS không trả lại password nên giữ user / pass trong sessionStorage: còn khi tải lại, mất khi đóng tab
const STORAGE_PREFIX = "localconsole:mq:";
const SESSION = "sessionStorage";

// Header Authorization đã lưu cho broker; undefined = chưa đăng nhập
export function useBrokerAuthorization(broker: string) {
  const key = `${STORAGE_PREFIX}${broker}`;
  const [authorization, setAuthorization] = useState(() => readStorage(key, SESSION) ?? undefined);

  // Giữ nguyên hàm giữa các lần render để dùng được làm dependency của effect
  const update = useCallback(
    (value?: string) => {
      writeStorage(key, value ?? "", SESSION);
      setAuthorization(value);
    },
    [key],
  );

  return [authorization, update] as const;
}
