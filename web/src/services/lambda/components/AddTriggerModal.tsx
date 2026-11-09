import { useWatch } from "react-hook-form";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import {
  FormCheckbox,
  FormInput,
  FormMultiselect,
  FormRadioGroup,
  FormSelect,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FLOCI_ACCOUNT_ID } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useBuckets } from "../../s3/hooks/useBuckets.ts";
import {
  S3_TRIGGER_EVENTS,
  SQS_BATCH_SIZE,
  SQS_QUEUE_ARN_EXAMPLE,
  TRIGGER_SOURCES,
} from "../constants.ts";
import { triggerSchema, type TriggerFormOutput } from "../schemas.ts";

const SOURCE_ITEMS = Object.entries(TRIGGER_SOURCES).map(([value, label]) => ({ value, label }));
const EVENT_OPTIONS = S3_TRIGGER_EVENTS.map((event) => ({ value: event, label: event }));

const INITIAL_VALUES = {
  source: "s3" as const,
  bucket: "",
  events: [S3_TRIGGER_EVENTS[0]],
  prefix: "",
  suffix: "",
  queueArn: "",
  batchSize: String(SQS_BATCH_SIZE.default),
  enabled: true,
};

interface Props {
  saving: boolean;
  onSave: (values: TriggerFormOutput) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AddTriggerModal({ saving, onSave, onDismiss }: Props) {
  const { region } = useLoadedConfig();
  const buckets = useBuckets();
  const form = useZodForm(triggerSchema, INITIAL_VALUES);
  const source = useWatch({ control: form.control, name: "source" });
  const bucketOptions = (buckets.data ?? []).map((bucket) => ({
    value: bucket.Name!,
    label: bucket.Name!,
  }));

  const s3Fields = (
    <>
      <FormSelect control={form.control} name='bucket' label='Bucket' options={bucketOptions} />
      <FormMultiselect
        control={form.control}
        name='events'
        label='Event types'
        options={EVENT_OPTIONS}
      />
      <ColumnLayout columns={2}>
        <FormInput
          control={form.control}
          name='prefix'
          label='Prefix'
          description='Optional, e.g. uploads/'
        />
        <FormInput
          control={form.control}
          name='suffix'
          label='Suffix'
          description='Optional, e.g. .png'
        />
      </ColumnLayout>
    </>
  );

  const sqsFields = (
    <>
      <FormInput
        control={form.control}
        name='queueArn'
        label='Queue ARN'
        placeholder={`arn:aws:sqs:${region}:${FLOCI_ACCOUNT_ID}:${SQS_QUEUE_ARN_EXAMPLE}`}
      />
      <FormInput
        control={form.control}
        name='batchSize'
        label='Batch size'
        constraintText={`${SQS_BATCH_SIZE.min}–${SQS_BATCH_SIZE.max} messages per invocation.`}
      />
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </>
  );

  return (
    <FormModal
      size='large'
      header='Add trigger'
      actionText='Add'
      loading={saving}
      onSubmit={form.handleSubmit(onSave)}
      onDismiss={onDismiss}
    >
      <FormRadioGroup control={form.control} name='source' label='Source' items={SOURCE_ITEMS} />
      {source === "s3" ? s3Fields : sqsFields}
    </FormModal>
  );
}
