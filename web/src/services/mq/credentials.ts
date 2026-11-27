import { useCallback, useState } from "react";

// AWS không trả lại password nên giữ user / pass trong sessionStorage: còn khi tải lại, mất khi đóng tab
const STORAGE_PREFIX = "localconsole:mq:";

// Storage có thể bị chặn (chế độ riêng tư): khi đó chỉ giữ trong lúc trang còn mở
function read(key: string) {
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value?: string) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Không lưu được thì vẫn dùng giá trị trong state
  }
}

// Header Authorization đã lưu cho broker; undefined = chưa đăng nhập
export function useBrokerAuthorization(broker: string) {
  const key = `${STORAGE_PREFIX}${broker}`;
  const [authorization, setAuthorization] = useState(() => read(key));

  // Giữ nguyên hàm giữa các lần render để dùng được làm dependency của effect
  const update = useCallback(
    (value?: string) => {
      write(key, value);
      setAuthorization(value);
    },
    [key],
  );

  return [authorization, update] as const;
}
