import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
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
  // Modal đóng bằng bất kỳ cách nào (Cancel, ✕, hoặc trang tự đóng sau khi xác
  // nhận xong) thì xóa chữ đã gõ: mở lại không được bật sẵn nút xóa / reset
  useEffect(() => {
    if (!visible) setTypedText("");
  }, [visible]);
  const confirmed = !confirmText || typedText === confirmText;
  // SpaceBetween tách mỗi con thành một dòng và lấy key từ con: chữ trần không có key (React cảnh báo)
  // và câu "Version {id} of {key}" bị cắt thành nhiều dòng, nên gom chữ vào một Box
  const body = Children.toArray(children).every(isValidElement) ? children : <Box>{children}</Box>;

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={header}
      footer={
        <ModalFooter
          actionText={actionText}
          disabled={!confirmed}
          loading={loading}
          onAction={onConfirm}
          onCancel={onDismiss}
        />
      }
    >
      <SpaceBetween size='m'>
        {body}
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
