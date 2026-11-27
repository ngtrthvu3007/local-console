import { useDeleteServices } from "../hooks/useServices.ts";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";

interface Props {
  cluster: string;
  names: readonly string[];
  onDismiss: () => void;
  onDone: () => void;
}

export function DeleteServicesModal({ cluster, names, onDismiss, onDone }: Props) {
  return (
    <BulkActionModal
      mutation={useDeleteServices(cluster)}
      items={names}
      lines={names}
      noun='service'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      Floci keeps the running tasks of a deleted service: stop them in the cluster&apos;s Tasks tab.
    </BulkActionModal>
  );
}
