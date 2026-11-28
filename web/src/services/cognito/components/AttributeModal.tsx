import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { EMAIL_ATTRIBUTE } from "../constants.ts";
import { useUpdateUserAttributes } from "../hooks/useUsers.ts";
import { attributeSchema, type AttributeForm } from "../schemas.ts";

const EMAIL_EDIT_HINT = "Floci sets email_verified to false and emails a code.";

interface Props {
  poolId: string;
  username: string;
  // Sửa: tên cố định. Thêm: chọn trong addableNames
  editing?: { name: string; value: string };
  addableNames: string[];
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AttributeModal({ poolId, username, editing, addableNames, onDismiss }: Props) {
  const update = useUpdateUserAttributes(poolId, username);

  const form = useZodForm(attributeSchema, {
    name: editing?.name ?? "",
    value: editing?.value ?? "",
  } satisfies AttributeForm);

  const name = editing?.name ?? form.watch("name");

  const submit = form.handleSubmit((values) =>
    update.mutate(
      [{ Name: values.name, Value: values.value }],
      notifyOutcome({
        success: `${editing ? "Saved" : "Added"} attribute ${values.name}`,
        errorHeader: `Couldn't save ${values.name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={editing ? "Edit attribute" : "Add attribute"}
      actionText={editing ? "Save" : "Add attribute"}
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {editing ? (
        <FormField label='Name'>
          <Box>{editing.name}</Box>
        </FormField>
      ) : (
        <FormSelect
          control={form.control}
          name='name'
          label='Name'
          placeholder='Choose an attribute'
          empty='This user already has every attribute in the schema.'
          options={addableNames.map((value) => ({ value }))}
        />
      )}
      <FormInput
        control={form.control}
        name='value'
        label='Value'
        description={name === EMAIL_ATTRIBUTE ? EMAIL_EDIT_HINT : undefined}
        autoFocus={Boolean(editing)}
      />
    </FormModal>
  );
}
