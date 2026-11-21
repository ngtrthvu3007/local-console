import type { ReactNode } from "react";
import { useWatch } from "react-hook-form";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormCheckbox,
  FormInput,
  FormMultiselect,
  FormRadioGroup,
  FormSelect,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useTables } from "../../dynamodb/hooks/useTables.ts";
import { dynamodbRoutes } from "../../dynamodb/routes.ts";
import { useBuckets } from "../../s3/hooks/useBuckets.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import { sqsRoutes } from "../../sqs/routes.ts";
import {
  ALREADY_TRIGGERED,
  DEFAULT_STARTING_POSITION,
  S3_TRIGGER_EVENTS,
  SQS_BATCH_SIZE,
  STARTING_POSITION_OPTIONS,
  STREAM_BATCH_SIZE,
  TRIGGER_SOURCES,
  type TriggerSource,
} from "../constants.ts";
import type { AddTriggerInput } from "../hooks/useTriggers.ts";
import { DEFAULT_MAPPING_OPTIONS } from "../mappingOptions.ts";
import { triggerSchema, type TriggerFormOutput } from "../schemas.ts";
import { MappingOptionsFields } from "./MappingOptionsFields.tsx";

const SOURCE_ITEMS = Object.entries(TRIGGER_SOURCES).map(([value, label]) => ({ value, label }));
const EVENT_OPTIONS = S3_TRIGGER_EVENTS.map((event) => ({ value: event, label: event }));
// Batch size mặc định khác nhau theo nguồn: SQS tối đa 10, stream 100
const DEFAULT_BATCH_SIZES: Partial<Record<TriggerSource, number>> = {
  sqs: SQS_BATCH_SIZE.default,
  dynamodb: STREAM_BATCH_SIZE.default,
};
const STREAM_OFF = "Stream is off";

const INITIAL_VALUES = {
  source: "s3" as const,
  bucket: "",
  events: [S3_TRIGGER_EVENTS[0]],
  prefix: "",
  suffix: "",
  queueArn: "",
  table: "",
  startingPosition: DEFAULT_STARTING_POSITION,
  batchSize: String(SQS_BATCH_SIZE.default),
  enabled: true,
  ...DEFAULT_MAPPING_OPTIONS,
};

interface Props {
  linkedSourceArns: readonly string[]; // queue / stream đã có trigger tới function này
  saving: boolean;
  onSave: (values: AddTriggerInput) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AddTriggerModal({ linkedSourceArns, saving, onSave, onDismiss }: Props) {
  const follow = useFollow();
  const buckets = useBuckets();
  const queues = useQueues();
  const tables = useTables();
  const form = useZodForm(triggerSchema, INITIAL_VALUES);
  const source = useWatch({ control: form.control, name: "source" });
  // Bảng chưa bật stream thì khóa trong dropdown, không tự bật stream thay người dùng
  const linked = (arn?: string) => Boolean(arn && linkedSourceArns.includes(arn));
  const tableOptions = (tables.data ?? []).map((table) => {
    const streamOn = Boolean(table.LatestStreamArn && table.StreamSpecification?.StreamEnabled);
    const triggered = linked(table.LatestStreamArn);
    return {
      value: table.TableName!,
      label: table.TableName!,
      disabled: !streamOn || triggered,
      description: !streamOn ? STREAM_OFF : triggered ? ALREADY_TRIGGERED : undefined,
    };
  });
  const streamArnOf = (tableName: string) =>
    tables.data?.find((table) => table.TableName === tableName)?.LatestStreamArn;

  const changeSource = (nextSource: TriggerSource) => {
    const batchSize = DEFAULT_BATCH_SIZES[nextSource];
    if (batchSize) form.setValue("batchSize", String(batchSize));
  };
  const save = (values: TriggerFormOutput) =>
    onSave({ ...values, streamArn: streamArnOf(values.table) });
  const queueOptions = (queues.data ?? []).map((queue) => ({
    value: queue.arn,
    label: queue.name,
    disabled: linked(queue.arn),
    description: linked(queue.arn) ? ALREADY_TRIGGERED : queue.arn,
  }));
  const bucketOptions = (buckets.data ?? []).map((bucket) => ({
    value: bucket.Name!,
    label: bucket.Name!,
  }));

  // Mỗi nguồn là một cụm field: bọc SpaceBetween vì fragment làm FormModal mất khoảng cách giữa các field
  const s3Fields = (
    <SpaceBetween size='m'>
      <FormSelect
        control={form.control}
        name='bucket'
        label='Bucket'
        placeholder='Choose a bucket'
        empty='No buckets'
        options={bucketOptions}
      />
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
    </SpaceBetween>
  );

  const sqsFields = (
    <SpaceBetween size='m'>
      <FormSelect
        control={form.control}
        name='queueArn'
        label='Queue'
        description={
          <Link href={sqsRoutes.createQueue} onFollow={follow}>
            Create a queue
          </Link>
        }
        placeholder='Choose a queue'
        empty='No queues'
        options={queueOptions}
      />
      <FormInput
        control={form.control}
        name='batchSize'
        label='Batch size'
        constraintText={`${SQS_BATCH_SIZE.min}–${SQS_BATCH_SIZE.max} messages per invocation.`}
      />
      <MappingOptionsFields form={form} source='sqs' />
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </SpaceBetween>
  );

  const streamHint = (
    <>
      Only tables with a stream can trigger a function.{" "}
      <Link href={dynamodbRoutes.tables} onFollow={follow}>
        Turn on a table's stream in its Settings
      </Link>
    </>
  );

  const dynamodbFields = (
    <SpaceBetween size='m'>
      <FormSelect
        control={form.control}
        name='table'
        label='Table'
        description={streamHint}
        options={tableOptions}
      />
      <ColumnLayout columns={2}>
        <FormSelect
          control={form.control}
          name='startingPosition'
          label='Starting position'
          options={STARTING_POSITION_OPTIONS}
        />
        <FormInput
          control={form.control}
          name='batchSize'
          label='Batch size'
          constraintText={`${STREAM_BATCH_SIZE.min}–${STREAM_BATCH_SIZE.max} records per invocation.`}
        />
      </ColumnLayout>
      <MappingOptionsFields form={form} source='dynamodb' />
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </SpaceBetween>
  );

  const fieldsBySource: Record<TriggerSource, ReactNode> = {
    s3: s3Fields,
    sqs: sqsFields,
    dynamodb: dynamodbFields,
  };

  return (
    <FormModal
      size='large'
      header='Add trigger'
      actionText='Add'
      loading={saving}
      onSubmit={form.handleSubmit(save)}
      onDismiss={onDismiss}
    >
      <FormRadioGroup
        control={form.control}
        name='source'
        label='Source'
        items={SOURCE_ITEMS}
        onChange={(value) => changeSource(value as TriggerSource)}
      />
      {fieldsBySource[source]}
    </FormModal>
  );
}
