import { useCallback, useState } from "react";

// User/pass của broker giữ trong tab (sessionStorage): còn khi tải lại, mất khi đóng tab.
// AWS API không trả lại password nên user phải nhập (spec chính, mục 4).
const STORAGE_PREFIX = "localconsole:mq:";
const BASIC_PREFIX = "Basic ";

// Header Basic cần base64 của UTF-8; btoa chỉ nhận Latin-1 nên đổi qua byte trước
export function basicAuthorization(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `${BASIC_PREFIX}${btoa(String.fromCharCode(...bytes))}`;
}

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
