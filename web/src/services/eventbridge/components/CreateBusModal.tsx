import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  BUS_NAME_MAX_LENGTH,
  nameConstraint,
  createBusSchema,
} from "@localconsole/core/eventbridge";
import { useCreateBus } from "../hooks/useBuses.ts";

// Chỉ mount khi mở
export function CreateBusModal({ onDismiss }: { onDismiss: () => void }) {
  const createBus = useCreateBus();
  const form = useZodForm(createBusSchema, { name: "" });

  const submit = form.handleSubmit(({ name }) =>
    createBus.mutate(
      name,
      notifyOutcome({
        success: `Created event bus ${name}`,
        errorHeader: `Couldn't create ${name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create event bus'
      actionText='Create event bus'
      loading={createBus.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Name'
        constraintText={nameConstraint(BUS_NAME_MAX_LENGTH)}
        placeholder='orders'
        autoFocus
      />
    </FormModal>
  );
}
