import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useCreateConfigurationSet } from "../hooks/useConfigurationSets.ts";
import { createConfigurationSetSchema } from "../schemas.ts";

interface Props {
  onDismiss: () => void;
  onCreated: (name: string) => void; // mở panel của set vừa tạo
}

// Chỉ mount khi mở
export function CreateConfigurationSetModal({ onDismiss, onCreated }: Props) {
  const create = useCreateConfigurationSet();
  const form = useZodForm(createConfigurationSetSchema, { name: "" });

  const submit = form.handleSubmit(({ name }) =>
    create.mutate(
      name,
      notifyOutcome({
        success: `Created configuration set ${name}`,
        errorHeader: "Couldn't create the configuration set",
        then: () => {
          onDismiss();
          onCreated(name);
        },
      }),
    ),
  );

  return (
    <FormModal
      header='Create configuration set'
      actionText='Create'
      loading={create.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Name'
        constraintText='Letters, numbers, hyphens and underscores. Up to 64 characters.'
        autoFocus
      />
    </FormModal>
  );
}
