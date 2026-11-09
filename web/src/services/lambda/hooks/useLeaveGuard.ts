import { useEffect } from "react";
import { useBlocker } from "react-router";
import { SKIP_LEAVE_GUARD } from "../routes.ts";

// Có thay đổi chưa lưu thì hỏi lại khi rời trang: đóng/tải lại tab (hộp thoại của trình duyệt)
// và chuyển trang trong app (trả blocker để trang tự hiện modal). Đổi tab trên cùng trang thì không hỏi.
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      currentLocation.pathname !== nextLocation.pathname &&
      !nextLocation.state?.[SKIP_LEAVE_GUARD],
  );
}
