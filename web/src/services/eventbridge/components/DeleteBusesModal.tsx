import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useReferencedNames } from "../../s3/hooks/useReferencedNames.ts";
import type { Bus } from "../buses.ts";
import { useDeleteBuses } from "../hooks/useBuses.ts";
import { useRules } from "../hooks/useRules.ts";

interface Props {
  buses: readonly Bus[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

function BusLine({ bus }: { bus: Bus }) {
  const rules = useRules(bus.name).data;
  return (
    <div>
      {bus.name}
      {rules?.length ? ` (${pluralize(rules.length, "rule")})` : ""}
    </div>
  );
}

// Chỉ mount khi mở
export function DeleteBusesModal({ buses, onDismiss, onDone }: Props) {
  const deleteBuses = useDeleteBuses();
  // Schedule (hoặc rule của IaC) trỏ tới bus: Floci không dọn, nên cảnh báo trước như queue / topic
  const referenced = useReferencedNames(buses).data ?? [];

  const submit = () =>
    deleteBuses.mutate(
      buses,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "event bus", "event buses")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(buses.length, "event bus", "event buses")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteBuses.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview
        lines={buses.map((bus) => (
          <BusLine key={bus.name} bus={bus} />
        ))}
      />
      <Alert type='warning'>Rules on these buses and their targets are deleted too.</Alert>
      <ReferencedWarning names={referenced} />
    </ConfirmModal>
  );
}
