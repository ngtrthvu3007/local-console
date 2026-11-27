import { useState } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { RECOVERY_DAYS } from "@localconsole/core/secretsmanager";
import { useDeleteSecret } from "../hooks/useSecrets.ts";

// Select thay ô nhập số: không có giá trị sai (7–30 ngày như AWS)
const DAY_OPTIONS = Array.from(
  { length: RECOVERY_DAYS.max - RECOVERY_DAYS.min + 1 },
  (_, index) => {
    const days = String(RECOVERY_DAYS.min + index);
    return { value: days, label: `${days} days` };
  },
);

interface Props {
  name: string;
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteSecretModal({ name, onDismiss, onDone }: Props) {
  const deleteSecret = useDeleteSecret();
  const [days, setDays] = useState(String(RECOVERY_DAYS.default));

  const submit = () =>
    deleteSecret.mutate(
      { name, recoveryDays: Number(days) },
      notifyOutcome({
        success: `Scheduled ${name} for deletion in ${days} days`,
        errorHeader: `Couldn't delete ${name}`,
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete secret ${name}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteSecret.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <FormField
        label='Waiting period'
        description="The secret is hidden and can't be read until the window ends. Creating a secret with the same name fails until then."
      >
        <Select
          selectedOption={DAY_OPTIONS.find((option) => option.value === days) ?? null}
          options={DAY_OPTIONS}
          onChange={({ detail }) => setDays(detail.selectedOption.value ?? days)}
        />
      </FormField>
    </ConfirmModal>
  );
}
