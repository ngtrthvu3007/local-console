import { Controller } from "react-hook-form";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { usePutSecretValue } from "../hooks/useSecrets.ts";
import { keyValueSchema, plaintextSchema } from "../schemas.ts";
import { textOfKeyValue, type KeyValue } from "../secretValue.ts";
import { KeyValueEditor } from "@shared/components/KeyValueEditor.tsx";

interface ModalProps {
  name: string;
  onDismiss: () => void;
}

const useSave = (name: string, onDismiss: () => void) => {
  const put = usePutSecretValue(name);

  const save = (value: string) =>
    put.mutate(
      value,
      notifyOutcome({
        success: `Saved the value of ${name}`,
        errorHeader: "Couldn't save the value",
        then: onDismiss,
      }),
    );

  return { save, saving: put.isPending };
};

// Chỉ mount khi mở
export function EditKeyValueModal({
  name,
  entries,
  onDismiss,
}: ModalProps & { entries: KeyValue[] }) {
  const { save, saving } = useSave(name, onDismiss);
  const form = useZodForm(keyValueSchema, { entries });
  const submit = form.handleSubmit((values) => save(textOfKeyValue(values.entries)));

  return (
    <FormModal
      size='large'
      header='Edit secret value'
      actionText='Save'
      loading={saving}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <Controller
        control={form.control}
        name='entries'
        render={({ field, formState }) => (
          <KeyValueEditor
            items={field.value}
            onChange={field.onChange}
            keyError={(index) => formState.errors.entries?.[index]?.key?.message}
          />
        )}
      />
    </FormModal>
  );
}

// Lưu nguyên văn, không format lại: app có thể đọc đúng từng ký tự
export function EditPlaintextModal({
  name,
  plaintext,
  onDismiss,
}: ModalProps & { plaintext: string }) {
  const { save, saving } = useSave(name, onDismiss);
  const form = useZodForm(plaintextSchema, { plaintext });
  const submit = form.handleSubmit((values) => save(values.plaintext));

  return (
    <FormModal
      size='large'
      header='Edit secret value'
      actionText='Save'
      loading={saving}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormValueEditor control={form.control} name='plaintext' label='Plaintext' language='text' />
    </FormModal>
  );
}
