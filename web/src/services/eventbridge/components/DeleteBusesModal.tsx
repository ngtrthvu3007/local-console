import Alert from "@cloudscape-design/components/alert";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { pluralize } from "@localconsole/core/shared";
import { useReferencedNames } from "../../s3/hooks/useReferencedNames.ts";
import type { Bus } from "@localconsole/core/eventbridge";
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

  return (
    <BulkActionModal
      mutation={deleteBuses}
      items={buses}
      lines={buses.map((bus) => (
        <BusLine key={bus.name} bus={bus} />
      ))}
      noun='event bus'
      nouns='event buses'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      <Alert type='warning'>Rules on these buses and their targets are deleted too.</Alert>
      <ReferencedWarning names={referenced} />
    </BulkActionModal>
  );
}
