import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
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

  const submit = () =>
    remove.mutate(
      names,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "configuration set")}`,
        errorHeader: "Couldn't delete",
        then: () => onDone(names),
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "configuration set")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={remove.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={names} />
      {identities.length > 0 && (
        <Alert type='warning'>
          Still the default of {identities.join(", ")}. Sending from{" "}
          {identities.length === 1 ? "it" : "them"} fails until you set another one.
        </Alert>
      )}
    </ConfirmModal>
  );
}
