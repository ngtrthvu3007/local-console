import type { ReactNode } from "react";
import Modal, { type ModalProps } from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ModalFooter } from "../ModalFooter.tsx";

interface Props {
  header: string;
  actionText: string;
  cancelText?: string;
  loading?: boolean;
  disabled?: boolean; // khóa nút chính khi không còn gì để gửi
  size?: ModalProps.Size;
  onSubmit: () => void;
  onDismiss: () => void;
  children: ReactNode;
}

// Modal chứa form, chỉ mount khi mở: mỗi lần mở là form mới với giá trị ban đầu.
// Enter trong ô nhập cũng submit.
export function FormModal(props: Props) {
  const { header, actionText, cancelText, loading, disabled, size, onSubmit, onDismiss, children } =
    props;

  const footer = (
    <ModalFooter
      actionText={actionText}
      cancelText={cancelText}
      loading={loading}
      disabled={disabled}
      onAction={onSubmit}
      onCancel={onDismiss}
    />
  );

  return (
    <Modal visible onDismiss={onDismiss} header={header} size={size} footer={footer}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <SpaceBetween size='m'>{children}</SpaceBetween>
        {/* Form có nhiều ô thì chỉ submit bằng Enter khi có nút submit; nút thật nằm ở footer */}
        <button type='submit' hidden aria-hidden tabIndex={-1} disabled={disabled || loading} />
      </form>
    </Modal>
  );
}
