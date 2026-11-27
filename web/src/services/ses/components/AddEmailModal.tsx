import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useCreateEmailIdentity } from "../hooks/useIdentities.ts";
import { addEmailSchema, type AddEmailForm } from "@localconsole/core/ses";

interface Props {
  onDismiss: () => void;
}

const INITIAL_VALUES: AddEmailForm = { email: "" };

// Chỉ mount khi mở
export function AddEmailModal({ onDismiss }: Props) {
  const createIdentity = useCreateEmailIdentity();
  const form = useZodForm(addEmailSchema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    createIdentity.mutate(
      values.email,
      notifyOutcome({
        success: `Added ${values.email}`,
        errorHeader: `Couldn't add ${values.email}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Add email'
      actionText='Add email'
      loading={createIdentity.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='email'
        label='Email address'
        placeholder='noreply@app.local'
        autoFocus
      />
    </FormModal>
  );
}
