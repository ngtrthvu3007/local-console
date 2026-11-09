import { useState, type ReactNode } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ModalFooter } from "./ModalFooter.tsx";

export const CONFIRM_DELETE = "delete";
export const CONFIRM_PERMANENT_DELETE = "permanently delete";

interface Props {
  visible: boolean;
  header: string;
  children?: ReactNode;
  // Có giá trị thì phải gõ đúng chuỗi này mới bấm được
  confirmText?: string;
  actionText: string;
  loading?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmModal({
  visible,
  header,
  children,
  confirmText,
  actionText,
  loading,
  onConfirm,
  onDismiss,
}: Props) {
  const [typedText, setTypedText] = useState("");
  const close = () => {
    setTypedText("");
    onDismiss();
  };
  const confirmed = !confirmText || typedText === confirmText;

  return (
    <Modal
      visible={visible}
      onDismiss={close}
      header={header}
      footer={
        <ModalFooter
          actionText={actionText}
          disabled={!confirmed}
          loading={loading}
          onAction={onConfirm}
          onCancel={close}
        />
      }
    >
      <SpaceBetween size='m'>
        {children}
        {confirmText && (
          <FormField label={`To confirm, type "${confirmText}"`}>
            <Input
              value={typedText}
              placeholder={confirmText}
              onChange={({ detail }) => setTypedText(detail.value)}
            />
          </FormField>
        )}
      </SpaceBetween>
    </Modal>
  );
}
