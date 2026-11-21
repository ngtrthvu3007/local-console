import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { NAME_MAX_LENGTH, nameConstraint } from "../constants.ts";
import { useCreateGroup } from "../hooks/useSchedules.ts";
import { createGroupSchema } from "../schemas.ts";

interface Props {
  onCreated: (name: string) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function CreateGroupModal({ onCreated, onDismiss }: Props) {
  const createGroup = useCreateGroup();
  const form = useZodForm(createGroupSchema, { name: "" });

  const submit = form.handleSubmit(({ name }) =>
    createGroup.mutate(
      name,
      notifyOutcome({
        success: `Created schedule group ${name}`,
        errorHeader: `Couldn't create ${name}`,
        then: () => {
          onCreated(name);
          onDismiss();
        },
      }),
    ),
  );

  return (
    <FormModal
      header='Create schedule group'
      actionText='Create group'
      loading={createGroup.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Name'
        constraintText={nameConstraint(NAME_MAX_LENGTH)}
        placeholder='jobs'
        autoFocus
      />
    </FormModal>
  );
}
