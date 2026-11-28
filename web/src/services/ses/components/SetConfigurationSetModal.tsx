import { FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useConfigurationSets } from "../hooks/useConfigurationSets.ts";
import { useSetIdentityConfigurationSet } from "../hooks/useIdentities.ts";
import { setConfigurationSetSchema } from "@localconsole/core/ses";

const NONE = { value: "", label: "None" };

interface Props {
  identity: string;
  current?: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Mail gửi từ identity mà không nêu configuration set sẽ dùng set này
export function SetConfigurationSetModal({ identity, current, onDismiss }: Props) {
  const sets = useConfigurationSets();
  const save = useSetIdentityConfigurationSet();
  const form = useZodForm(setConfigurationSetSchema, { configurationSet: current ?? "" });

  const submit = form.handleSubmit(({ configurationSet }) =>
    save.mutate(
      { identity, configurationSet: configurationSet || undefined },
      notifyOutcome({
        success: configurationSet
          ? `${identity} now uses ${configurationSet}`
          : `Removed the default configuration set of ${identity}`,
        errorHeader: "Couldn't change the configuration set",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Set configuration set for ${identity}`}
      actionText='Save'
      loading={save.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='configurationSet'
        label='Default configuration set'
        description='Mail sent from this identity without a configuration set uses this one.'
        options={[NONE, ...(sets.data ?? []).map((name) => ({ value: name, label: name }))]}
      />
    </FormModal>
  );
}
