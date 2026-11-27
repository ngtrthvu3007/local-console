import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  CLASS_OPTIONS,
  DEFAULT_INSTANCE_CLASS,
  IDENTIFIER_RULE,
  addInstanceSchema,
} from "@localconsole/core/docdb";
import { useAddInstance } from "../hooks/useInstances.ts";

interface Props {
  cluster: string;
  suggestedId: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AddInstanceModal({ cluster, suggestedId, onDismiss }: Props) {
  const addInstance = useAddInstance(cluster);
  const form = useZodForm(addInstanceSchema, {
    identifier: suggestedId,
    instanceClass: DEFAULT_INSTANCE_CLASS,
  });

  const submit = form.handleSubmit((values) =>
    addInstance.mutate(
      values,
      notifyOutcome({
        success: `Added instance ${values.identifier}`,
        errorHeader: `Couldn't add ${values.identifier}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Add instance to ${cluster}`}
      actionText='Add instance'
      loading={addInstance.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='identifier'
        label='Instance identifier'
        constraintText={IDENTIFIER_RULE}
        autoFocus
      />
      <FormSelect
        control={form.control}
        name='instanceClass'
        label='Instance class'
        options={CLASS_OPTIONS}
      />
    </FormModal>
  );
}
