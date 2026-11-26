import Alert from "@cloudscape-design/components/alert";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteConfigurationSets } from "../hooks/useConfigurationSets.ts";

interface Props {
  names: string[];
  // Identity đang dùng từng set làm mặc định: xóa set thì identity đó gửi mail lỗi
  usedBy: Map<string, string[]>;
  onDismiss: () => void;
  onDone: (names: string[]) => void;
}

// Chỉ mount khi mở
export function DeleteConfigurationSetsModal({ names, usedBy, onDismiss, onDone }: Props) {
  const remove = useDeleteConfigurationSets();
  const identities = [...new Set(names.flatMap((name) => usedBy.get(name) ?? []))];

  return (
    <BulkActionModal
      mutation={remove}
      items={names}
      lines={names}
      noun='configuration set'
      onDismiss={onDismiss}
      onDone={() => onDone(names)}
    >
      {identities.length > 0 && (
        <Alert type='warning'>
          Still the default of {identities.join(", ")}. Sending from{" "}
          {identities.length === 1 ? "it" : "them"} fails until you set another one.
        </Alert>
      )}
    </BulkActionModal>
  );
}
