import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { NEVER_EXPIRE, retentionDays, retentionSchema } from "@localconsole/core/logs";
import { usePutRetention } from "../hooks/useLogGroups.ts";
import { RetentionSelect } from "./CreateLogGroupModal.tsx";

interface Props {
  group: string;
  days?: number; // retention hiện tại; không có = Never expire
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function EditRetentionModal({ group, days, onDismiss }: Props) {
  const putRetention = usePutRetention(group);
  const form = useZodForm(retentionSchema, {
    retention: days === undefined ? NEVER_EXPIRE : String(days),
  });

  const submit = form.handleSubmit(({ retention }) =>
    putRetention.mutate(
      retentionDays(retention),
      notifyOutcome({
        success: `Updated retention of ${group}`,
        errorHeader: `Couldn't update ${group}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit retention'
      actionText='Save'
      loading={putRetention.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <RetentionSelect control={form.control} name='retention' />
    </FormModal>
  );
}
