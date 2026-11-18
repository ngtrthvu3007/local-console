import { useWatch } from "react-hook-form";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { SECONDS_PER_MINUTE } from "@shared/constants.ts";
import { formatDuration } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { MAX_RECEIVE_COUNT, SETTING_LIMITS } from "../constants.ts";
import { useQueues, useUpdateRedrivePolicy, useUpdateSettings } from "../hooks/useQueues.ts";
import { bytesToKiB, kiBToBytes, type Queue } from "../queues.ts";
import { deadLetterSchema, queueSettingsSchema } from "../schemas.ts";

// "0–900 seconds (up to 15m 0s)": cùng số với lỗi validate, kèm thời lượng dễ đọc khi số lớn
const secondsRange = ({ min, max }: { min: number; max: number }) =>
  `${min}–${max} seconds${max >= SECONDS_PER_MINUTE ? ` (up to ${formatDuration(max)})` : ""}.`;

// Các modal chỉ mount khi mở

interface Props {
  queue: Queue;
  onDismiss: () => void;
}

export function EditSettingsModal({ queue, onDismiss }: Props) {
  const updateSettings = useUpdateSettings(queue);
  const { settings } = queue;
  const form = useZodForm(queueSettingsSchema, {
    visibilityTimeout: String(settings.visibilityTimeout),
    delay: String(settings.delay),
    retention: String(settings.retention),
    maxMessageSizeKiB: String(bytesToKiB(settings.maxMessageSize)),
    receiveWait: String(settings.receiveWait),
    contentBasedDedup: settings.contentBasedDedup,
  });

  const submit = form.handleSubmit(({ maxMessageSizeKiB, ...values }) =>
    updateSettings.mutate(
      { ...values, maxMessageSize: kiBToBytes(maxMessageSizeKiB) },
      notifyOutcome({
        success: `Saved settings of ${queue.name}`,
        errorHeader: "Couldn't save settings",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit settings'
      actionText='Save'
      loading={updateSettings.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <ColumnLayout columns={2}>
        <FormInput
          control={form.control}
          name='visibilityTimeout'
          label='Visibility timeout'
          description='How long a received message stays hidden from other consumers.'
          constraintText={secondsRange(SETTING_LIMITS.visibilityTimeout)}
        />
        <FormInput
          control={form.control}
          name='delay'
          label='Delivery delay'
          description='How long new messages wait before consumers can receive them.'
          constraintText={secondsRange(SETTING_LIMITS.delay)}
        />
        <FormInput
          control={form.control}
          name='retention'
          label='Message retention'
          description='How long a message stays in the queue if no one deletes it.'
          constraintText={secondsRange(SETTING_LIMITS.retention)}
        />
        <FormInput
          control={form.control}
          name='maxMessageSizeKiB'
          label='Maximum message size'
          description='Largest message body the queue accepts.'
          constraintText={`${SETTING_LIMITS.maxMessageSizeKiB.min}–${SETTING_LIMITS.maxMessageSizeKiB.max} KiB.`}
        />
        <FormInput
          control={form.control}
          name='receiveWait'
          label='Receive message wait time'
          description='Long polling: how long a receive call waits for a message.'
          constraintText={secondsRange(SETTING_LIMITS.receiveWait)}
        />
      </ColumnLayout>
      {queue.fifo && (
        <FormCheckbox
          control={form.control}
          name='contentBasedDedup'
          text='Content-based deduplication'
          description='Use a hash of the body as the deduplication ID.'
        />
      )}
    </FormModal>
  );
}

export function EditDeadLetterModal({ queue, onDismiss }: Props) {
  const queues = useQueues();
  const updateRedrivePolicy = useUpdateRedrivePolicy(queue);
  const current = queue.redrivePolicy;
  const form = useZodForm(deadLetterSchema, {
    enabled: Boolean(current),
    deadLetterTargetArn: current?.deadLetterTargetArn ?? "",
    maxReceiveCount: String(current?.maxReceiveCount ?? MAX_RECEIVE_COUNT.default),
  });
  const enabled = useWatch({ control: form.control, name: "enabled" });
  // SQS bắt DLQ cùng loại với queue nguồn: FIFO chỉ chọn được queue FIFO
  const options = (queues.data ?? [])
    .filter((candidate) => candidate.fifo === queue.fifo && candidate.arn !== queue.arn)
    .map((candidate) => ({ value: candidate.arn, label: candidate.name }));

  const submit = form.handleSubmit((values) =>
    updateRedrivePolicy.mutate(
      values.enabled
        ? {
            deadLetterTargetArn: values.deadLetterTargetArn,
            maxReceiveCount: Number(values.maxReceiveCount),
          }
        : undefined,
      notifyOutcome({
        success: values.enabled
          ? `Dead-letter queue is on for ${queue.name}`
          : "Dead-letter queue is off",
        errorHeader: "Couldn't change the dead-letter queue",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit dead-letter queue'
      actionText='Save'
      loading={updateRedrivePolicy.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormCheckbox
        control={form.control}
        name='enabled'
        text='Turn on dead-letter queue'
        description='Messages received too many times without being deleted move to another queue.'
      />
      {enabled && (
        <SpaceBetween size='m'>
          <FormSelect
            control={form.control}
            name='deadLetterTargetArn'
            label='Dead-letter queue'
            description={`Only ${queue.fifo ? "FIFO" : "Standard"} queues can be chosen.`}
            placeholder='Choose a queue'
            empty='No other queues of this type'
            options={options}
          />
          <FormInput
            control={form.control}
            name='maxReceiveCount'
            label='Maximum receives'
            constraintText={`${MAX_RECEIVE_COUNT.min}–${MAX_RECEIVE_COUNT.max}.`}
          />
        </SpaceBetween>
      )}
    </FormModal>
  );
}
