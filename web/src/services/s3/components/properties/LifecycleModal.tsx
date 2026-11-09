import Box from "@cloudscape-design/components/box";
import type { RadioGroupProps } from "@cloudscape-design/components/radio-group";
import { FormCheckbox, FormInput, FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { LIFECYCLE_STATUS } from "../../constants.ts";
import { lifecycleSchema, type LifecycleFormOutput } from "../../schemas.ts";

const STATUS_ITEMS: RadioGroupProps.RadioButtonDefinition[] = [
  { value: LIFECYCLE_STATUS.enabled, label: "Enabled" },
  { value: LIFECYCLE_STATUS.disabled, label: "Disabled" },
];

const INITIAL_VALUES = {
  id: "",
  prefix: "",
  status: LIFECYCLE_STATUS.enabled,
  expireDays: "",
  noncurrentDays: "",
  abortDays: "",
  deleteExpiredMarkers: false,
};

const DAYS_PLACEHOLDER = "Days, e.g. 30";
const SKIP_HINT = "Leave empty to skip.";

interface Props {
  existingIds: string[];
  saving: boolean;
  onSave: (values: LifecycleFormOutput) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function LifecycleModal({ existingIds, saving, onSave, onDismiss }: Props) {
  const form = useZodForm(lifecycleSchema(existingIds), INITIAL_VALUES);
  const submit = form.handleSubmit(onSave);

  return (
    <FormModal
      size='large'
      header='Create lifecycle rule'
      actionText='Create rule'
      loading={saving}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <Box color='text-body-secondary'>
        Floci applies rules about once a minute. Day counts round up to the next midnight UTC.
      </Box>
      <FormInput
        control={form.control}
        name='id'
        label='Rule name'
        placeholder='expire-tmp'
        autoFocus
      />
      <FormInput
        control={form.control}
        name='prefix'
        label='Prefix'
        description='Optional. Leave empty to apply the rule to the whole bucket.'
        placeholder='tmp/'
      />
      <FormRadioGroup control={form.control} name='status' label='Status' items={STATUS_ITEMS} />
      <FormInput
        control={form.control}
        name='expireDays'
        label='Expire current versions after'
        description={`With versioning on, S3 adds a delete marker instead. ${SKIP_HINT}`}
        placeholder={DAYS_PLACEHOLDER}
      />
      <FormInput
        control={form.control}
        name='noncurrentDays'
        label='Permanently delete noncurrent versions after'
        description={SKIP_HINT}
        placeholder={DAYS_PLACEHOLDER}
      />
      <FormInput
        control={form.control}
        name='abortDays'
        label='Abort incomplete multipart uploads after'
        description={SKIP_HINT}
        placeholder={DAYS_PLACEHOLDER}
      />
      <FormCheckbox
        control={form.control}
        name='deleteExpiredMarkers'
        text='Delete expired object delete markers'
        description='Removes a delete marker once it is the only version left of its key.'
      />
    </FormModal>
  );
}
