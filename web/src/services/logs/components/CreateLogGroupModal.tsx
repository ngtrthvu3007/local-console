import { useNavigate } from "react-router";
import type { Control, FieldValues, Path } from "react-hook-form";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyError, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  GROUP_NAME_RULE,
  NEVER_EXPIRE,
  RETENTION_OPTIONS,
  createLogGroupSchema,
  retentionDays,
  logsRoutes,
} from "@localconsole/core/logs";
import { useCreateLogGroup } from "../hooks/useLogGroups.ts";

// Ô Retention dùng chung cho form tạo và Edit retention: chỉ có giá trị AWS cho phép
export function RetentionSelect<TValues extends FieldValues>({
  control,
  name,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
}) {
  return <FormSelect control={control} name={name} label='Retention' options={RETENTION_OPTIONS} />;
}

// Chỉ mount khi mở
export function CreateLogGroupModal({ onDismiss }: { onDismiss: () => void }) {
  const navigate = useNavigate();
  const createGroup = useCreateLogGroup();
  const form = useZodForm(createLogGroupSchema, { name: "", retention: NEVER_EXPIRE });

  const submit = form.handleSubmit(({ name, retention }) =>
    createGroup.mutate(
      { name, days: retentionDays(retention) },
      notifyOutcome({
        success: `Created log group ${name}`,
        errorHeader: `Couldn't create ${name}`,
        then: ({ name: created, retentionError }) => {
          navigate(logsRoutes.group(created));
          if (retentionError) notifyError(retentionError, `Couldn't set retention of ${created}`);
        },
      }),
    ),
  );

  return (
    <FormModal
      header='Create log group'
      actionText='Create log group'
      loading={createGroup.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Name'
        constraintText={GROUP_NAME_RULE}
        placeholder='/my-app/api'
        autoFocus
      />
      <RetentionSelect control={form.control} name='retention' />
    </FormModal>
  );
}
