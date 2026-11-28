import Alert from "@cloudscape-design/components/alert";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { errorMessage } from "@localconsole/core/shared";
import { notifySuccess } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useCreateGroup } from "../hooks/useGroups.ts";
import { createGroupSchema, type CreateGroupForm } from "@localconsole/core/cognito";

const INITIAL_VALUES: CreateGroupForm = { name: "", description: "", precedence: "" };

// Chỉ mount khi mở
export function CreateGroupModal({ poolId, onDismiss }: { poolId: string; onDismiss: () => void }) {
  const createGroup = useCreateGroup(poolId);
  const form = useZodForm(createGroupSchema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    createGroup.mutate(values, {
      onSuccess: (group) => {
        notifySuccess(`Created group ${group.GroupName ?? values.name}`);
        onDismiss();
      },
    }),
  );

  return (
    <FormModal
      header='Create group'
      actionText='Create group'
      loading={createGroup.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {createGroup.isError && <Alert type='error'>{errorMessage(createGroup.error)}</Alert>}
      <FormInput control={form.control} name='name' label='Name' autoFocus />
      <FormInput control={form.control} name='description' label='Description - optional' />
      <FormInput control={form.control} name='precedence' label='Precedence - optional' />
    </FormModal>
  );
}
