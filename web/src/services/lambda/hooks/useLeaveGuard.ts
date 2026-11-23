import { useEffect } from "react";
import { useBlocker } from "react-router";
import { SKIP_LEAVE_GUARD } from "../routes.ts";

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
