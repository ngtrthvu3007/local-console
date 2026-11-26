import type { ReactNode } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { pluralize } from "../format.ts";
import { notifyBulkOutcome } from "../hooks/useNotify.ts";
import { CONFIRM_DELETE, ConfirmModal } from "./ConfirmModal.tsx";
import { DeletePreview } from "./DeletePreview.tsx";

interface Props<TVariables> {
  mutation: UseMutationResult<{ count: number; failures: string[] }, unknown, TVariables>;
  items: TVariables; // gửi cho mutation
  lines: readonly ReactNode[]; // các mục hiện trong modal (vài mục đầu)
  noun: string; // "queue", "event bus"…
  nouns?: string; // số nhiều bất quy tắc, vd: "event buses"
  header?: string; // mặc định "Delete 2 queues?"
  verb?: string; // nút chính, mặc định "Delete"
  done?: string; // thông báo, mặc định "Deleted" (xóa chạy nền thì "Deleting")
  confirmText?: string | false; // chữ phải gõ; false = không bắt gõ
  children?: ReactNode; // cảnh báo
  onDismiss: () => void;
  onDone: () => void; // gọi khi làm được ít nhất một mục, thay cho onDismiss
}

// Modal xác nhận thao tác hàng loạt (xóa, dừng…) và báo kết quả từng mục. Không làm được mục nào
// thì chỉ đóng modal: trang chi tiết không rời đi khi xóa thất bại. Chỉ mount khi mở
export function BulkActionModal<TVariables>(props: Props<TVariables>) {
  const { mutation, items, lines, noun, nouns, verb = "Delete", done = "Deleted" } = props;
  const confirmText = props.confirmText ?? CONFIRM_DELETE;

  const submit = () =>
    mutation.mutate(
      items,
      notifyBulkOutcome({
        success: (result) => `${done} ${pluralize(result.count, noun, nouns)}`,
        errorHeader: `Couldn't ${verb.toLowerCase()}`,
        then: (result) => (result.count ? props.onDone() : props.onDismiss()),
      }),
    );

  return (
    <ConfirmModal
      visible
      header={props.header ?? `${verb} ${pluralize(lines.length, noun, nouns)}?`}
      confirmText={confirmText || undefined}
      actionText={verb}
      loading={mutation.isPending}
      onConfirm={submit}
      onDismiss={props.onDismiss}
    >
      <DeletePreview lines={lines} />
      {props.children}
    </ConfirmModal>
  );
}
