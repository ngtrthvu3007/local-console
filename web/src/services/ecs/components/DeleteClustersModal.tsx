import { useDeleteClusters } from "../hooks/useClusters.ts";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";

interface Props {
  names: readonly string[];
  onDismiss: () => void;
  onDone: () => void;
}

export function DeleteClustersModal({ names, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      verb='Delete'
      done='Deleted'
      mutation={useDeleteClusters()}
      items={names}
      lines={names}
      noun='cluster'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      Delete or scale down the services of a cluster and stop its tasks first: a cluster that still
      has them can&apos;t be deleted.
    </BulkActionModal>
  );
}
