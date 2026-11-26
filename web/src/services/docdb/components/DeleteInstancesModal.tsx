import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteInstances } from "../hooks/useInstances.ts";

interface Props {
  ids: readonly string[];
  onDismiss: () => void;
  onDone: () => void;
}

export function DeleteInstancesModal({ ids, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      mutation={useDeleteInstances()}
      items={ids}
      lines={ids}
      noun='instance'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      The cluster and its data stay: on Floci an instance is only a record.
    </BulkActionModal>
  );
}
