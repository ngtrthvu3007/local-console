import type { ReactNode } from "react";
import type { Blocker } from "react-router";
import { ConfirmModal } from "./ConfirmModal.tsx";

// Hộp hỏi lại của useLeaveGuard: Leave thì đi tiếp, Cancel thì ở lại trang
export function LeaveModal({ blocker, children }: { blocker: Blocker; children: ReactNode }) {
  return (
    <ConfirmModal
      visible={blocker.state === "blocked"}
      header='Leave this page?'
      actionText='Leave'
      onConfirm={() => blocker.proceed?.()}
      onDismiss={() => blocker.reset?.()}
    >
      {children}
    </ConfirmModal>
  );
}
