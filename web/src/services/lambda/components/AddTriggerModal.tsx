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
import { dynamodbRoutes } from "@localconsole/core/dynamodb";
import { useStreams } from "../../kinesis/hooks/useStreams.ts";
import { kinesisRoutes } from "@localconsole/core/kinesis";
import { bucketOptions } from "@localconsole/core/s3";
import { useBuckets } from "../../s3/hooks/useBuckets.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import { sqsRoutes } from "@localconsole/core/sqs";
import {
  ALREADY_TRIGGERED,
  DEFAULT_STARTING_POSITION,
  S3_TRIGGER_EVENTS,
  SQS_BATCH_SIZE,
  STARTING_POSITION_OPTIONS,
  STREAM_BATCH_SIZE,
  TRIGGER_SOURCES,
  type TriggerSource,
  DEFAULT_MAPPING_OPTIONS,
  triggerSchema,
  type TriggerFormOutput,
  type AddTriggerInput,
} from "@localconsole/core/lambda";
import { MappingOptionsFields } from "./MappingOptionsFields.tsx";

const SOURCE_ITEMS = Object.entries(TRIGGER_SOURCES).map(([value, label]) => ({ value, label }));
const EVENT_OPTIONS = S3_TRIGGER_EVENTS.map((event) => ({ value: event, label: event }));
// Batch size mặc định khác nhau theo nguồn: SQS tối đa 10, stream 100
const DEFAULT_BATCH_SIZES: Partial<Record<TriggerSource, number>> = {
  sqs: SQS_BATCH_SIZE.default,
  dynamodb: STREAM_BATCH_SIZE.default,
  kinesis: STREAM_BATCH_SIZE.default,
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
  stream: "",
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
  const streams = useStreams();
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
    onSave({
      ...values,
      streamArn: values.source === "kinesis" ? values.stream : streamArnOf(values.table),
    });
  const kinesisOptions = (streams.data ?? []).map((stream) => ({
    value: stream.arn,
    label: stream.name,
    disabled: linked(stream.arn),
    description: linked(stream.arn) ? ALREADY_TRIGGERED : undefined,
  }));
  const queueOptions = (queues.data ?? []).map((queue) => ({
    value: queue.arn,
    label: queue.name,
    disabled: linked(queue.arn),
    description: linked(queue.arn) ? ALREADY_TRIGGERED : queue.arn,
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
        options={bucketOptions(buckets.data)}
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

  // DynamoDB Stream và Kinesis cùng là stream: chung starting position, batch size, tùy chọn
  const streamOptionFields = (
    <SpaceBetween size='m'>
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
      <MappingOptionsFields form={form} source={source === "kinesis" ? "kinesis" : "dynamodb"} />
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </SpaceBetween>
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
      {streamOptionFields}
    </SpaceBetween>
  );

  const kinesisFields = (
    <SpaceBetween size='m'>
      <FormSelect
        control={form.control}
        name='stream'
        label='Data stream'
        description={
          <Link href={kinesisRoutes.createStream} onFollow={follow}>
            Create a data stream
          </Link>
        }
        placeholder='Choose a data stream'
        empty='No data streams'
        options={kinesisOptions}
      />
      {streamOptionFields}
    </SpaceBetween>
  );

  const fieldsBySource: Record<TriggerSource, ReactNode> = {
    s3: s3Fields,
    sqs: sqsFields,
    dynamodb: dynamodbFields,
    kinesis: kinesisFields,
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
