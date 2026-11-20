import { FormInput, FormTextarea, FormTiles } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { DEFAULT_SMS_TYPE, PHONE_NUMBER_EXAMPLE, SMS_TYPES, type SmsType } from "../constants.ts";
import { usePublishSms } from "../hooks/useSms.ts";
import { publishSmsSchema } from "../schemas.ts";

const TYPE_DESCRIPTIONS: Record<SmsType, string> = {
  Transactional: "Critical messages, like one-time passwords.",
  Promotional: "Marketing messages, not time-critical.",
};
const TYPE_ITEMS = SMS_TYPES.map((type) => ({
  value: type,
  label: type,
  description: TYPE_DESCRIPTIONS[type],
}));

const MESSAGE_ROWS = 4;

// Chỉ mount khi mở
export function PublishSmsModal({ onDismiss }: { onDismiss: () => void }) {
  const publish = usePublishSms();
  const form = useZodForm(publishSmsSchema, {
    phoneNumber: "",
    message: "",
    type: DEFAULT_SMS_TYPE,
  });

  const submit = form.handleSubmit((values) =>
    publish.mutate(
      values,
      notifyOutcome({
        success: (result) => `Published text message ${result.MessageId}`,
        errorHeader: "Couldn't publish the text message",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Publish text message'
      actionText='Publish'
      loading={publish.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='phoneNumber'
        label='Phone number'
        description="Floci doesn't send real SMS. Any number works."
        placeholder={PHONE_NUMBER_EXAMPLE}
        autoFocus
      />
      <FormTextarea control={form.control} name='message' label='Message' rows={MESSAGE_ROWS} />
      <FormTiles control={form.control} name='type' label='Message type' items={TYPE_ITEMS} />
    </FormModal>
  );
}
