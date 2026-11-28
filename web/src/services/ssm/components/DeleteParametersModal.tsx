import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteParameters } from "../hooks/useParameters.ts";

interface Props {
  names: readonly string[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteParametersModal({ names, onDismiss, onDone }: Props) {
  const deleteParameters = useDeleteParameters();

  return (
    <BulkActionModal
      mutation={deleteParameters}
      items={names}
      lines={names}
      noun='parameter'
      onDismiss={onDismiss}
      onDone={onDone}
    ></BulkActionModal>
  );
}
