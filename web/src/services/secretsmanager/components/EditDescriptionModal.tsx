import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useUpdateDescription } from "../hooks/useSecrets.ts";
import { descriptionSchema } from "../schemas.ts";

interface Props {
  name: string;
  description: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function EditDescriptionModal({ name, description, onDismiss }: Props) {
  const update = useUpdateDescription(name);
  const form = useZodForm(descriptionSchema, { description });

  const submit = form.handleSubmit((values) =>
    update.mutate(
      values.description,
      notifyOutcome({
        success: `Updated the description of ${name}`,
        errorHeader: "Couldn't update the description",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit description'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='description' label='Description' autoFocus />
    </FormModal>
  );
}
