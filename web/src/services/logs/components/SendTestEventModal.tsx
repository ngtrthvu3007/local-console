import { FormInput, FormTextarea } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_TEST_STREAM,
  STREAM_NAME_RULE,
  TEXT,
  testEventSchema,
} from "@localconsole/core/logs";
import { useSendTestEvent } from "../hooks/useLogStreams.ts";

// Chỉ mount khi mở
export function SendTestEventModal({ group, onDismiss }: { group: string; onDismiss: () => void }) {
  const sendEvent = useSendTestEvent(group);
  const form = useZodForm(testEventSchema, { stream: DEFAULT_TEST_STREAM, message: "" });

  const submit = form.handleSubmit((values) =>
    sendEvent.mutate(
      values,
      notifyOutcome({
        success: `Sent a test event to ${values.stream}`,
        errorHeader: `Couldn't send the test event`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Send test event'
      actionText='Send'
      loading={sendEvent.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='stream'
        label='Log stream'
        description='Created if it does not exist.'
        constraintText={STREAM_NAME_RULE}
      />
      <FormTextarea
        control={form.control}
        name='message'
        label='Message'
        constraintText={TEXT.testEvent}
        placeholder='ERROR something failed'
      />
    </FormModal>
  );
}
