import { useEffect } from "react";
import { useBlocker } from "react-router";

// Rời trang có thay đổi chưa lưu thì hỏi lại, trừ điều hướng mang cờ này (vd: sau khi lưu / xóa)
export const SKIP_LEAVE_GUARD = "skipLeaveGuard";
export const skipLeaveGuard = { state: { [SKIP_LEAVE_GUARD]: true } };

// Hỏi lại khi đóng tab hoặc chuyển trang lúc còn thay đổi chưa lưu; đổi tab trong trang thì không
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
