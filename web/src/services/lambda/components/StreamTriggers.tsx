import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { EventSourceMappingConfiguration } from "@aws-sdk/client-lambda";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  ALREADY_TRIGGERED,
  DEFAULT_STARTING_POSITION,
  EVENT_SOURCE_STATES,
  STARTING_POSITION_OPTIONS,
  STARTING_POSITIONS,
  STREAM_BATCH_SIZE,
  type StartingPosition,
  functionNameOfMapping,
  DEFAULT_MAPPING_OPTIONS,
  type MappingSource,
  streamTriggerSchema,
  FUNCTION_TABS,
  lambdaRoutes,
} from "@localconsole/core/lambda";
import { useFunctions } from "../hooks/useFunctions.ts";
import { useAddStreamTrigger, useStreamTriggers } from "../hooks/useTriggers.ts";
import { BrokenTriggersAlert } from "./BrokenTriggersAlert.tsx";
import { FunctionLink } from "./FunctionLink.tsx";
import { MappingOptionsFields } from "./MappingOptionsFields.tsx";

// Bảng Lambda trigger và nút Add trigger trên trang của stream (DynamoDB Stream, Kinesis)

const startingPositionText = (mapping: EventSourceMappingConfiguration) =>
  STARTING_POSITIONS[mapping.StartingPosition as StartingPosition] ?? NOT_AVAILABLE;

// Nút trong thông báo: mở tab Triggers của function vừa gắn (cũng dùng ở Add trigger của queue SQS)
export function ViewFunctionButton({ functionName }: { functionName: string }) {
  const follow = useFollow();
  return (
    <Button href={lambdaRoutes.function(functionName, FUNCTION_TABS.triggers)} onFollow={follow}>
      View function
    </Button>
  );
}

interface ModalProps {
  source: Exclude<MappingSource, "sqs">;
  sourceName: string; // vd: tên bảng, tên stream
  streamArn: string;
  runsWhen: string; // vd: "items in orders change"
  onDismiss: () => void;
}

// Chỉ mount khi mở. Cùng giới hạn và mặc định với modal Add trigger của Lambda
function StreamTriggerModal({ source, sourceName, streamArn, runsWhen, onDismiss }: ModalProps) {
  const functions = useFunctions();
  const addTrigger = useAddStreamTrigger(streamArn);
  const triggers = useStreamTriggers(streamArn);
  const form = useZodForm(streamTriggerSchema, {
    functionName: "",
    startingPosition: DEFAULT_STARTING_POSITION,
    batchSize: String(STREAM_BATCH_SIZE.default),
    enabled: true,
    ...DEFAULT_MAPPING_OPTIONS,
  });
  // AWS từ chối trigger thứ hai cho cùng stream và function (Floci thì nhận)
  const linked = new Set((triggers.data ?? []).map(functionNameOfMapping));
  const functionOptions = (functions.data ?? []).map((item) => ({
    value: item.FunctionName!,
    label: item.FunctionName!,
    disabled: linked.has(item.FunctionName!),
    description: linked.has(item.FunctionName!) ? ALREADY_TRIGGERED : item.Runtime,
  }));

  const submit = form.handleSubmit((values) =>
    addTrigger.mutate(
      values,
      notifyOutcome({
        success: `${values.functionName} now runs when ${runsWhen}`,
        successAction: <ViewFunctionButton functionName={values.functionName} />,
        errorHeader: "Couldn't add the trigger",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Add Lambda trigger to ${sourceName}`}
      actionText='Add'
      loading={addTrigger.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='functionName'
        label='Function'
        placeholder='Choose a function'
        options={functionOptions}
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
      <MappingOptionsFields form={form} source={source} />
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </FormModal>
  );
}

interface TableOptions extends Omit<ModalProps, "onDismiss"> {
  description: string; // khi đã có trigger
  compact: boolean;
}

export function StreamTriggersTable({ description, compact, ...modalProps }: TableOptions) {
  const triggers = useStreamTriggers(modalProps.streamArn);
  const [adding, setAdding] = useState(false);
  const count = triggers.data?.length ?? 0;

  const columns: TableProps.ColumnDefinition<EventSourceMappingConfiguration>[] = [
    {
      id: "function",
      header: "Function",
      isRowHeader: true,
      cell: (mapping) => (
        <FunctionLink arn={mapping.FunctionArn ?? ""} tab={FUNCTION_TABS.triggers} />
      ),
    },
    {
      id: "state",
      header: "State",
      cell: (mapping) => (
        <StatusIndicator
          type={mapping.State === EVENT_SOURCE_STATES.enabled ? "success" : "stopped"}
        >
          {mapping.State}
        </StatusIndicator>
      ),
    },
    ...(compact
      ? []
      : [
          {
            id: "batch-size",
            header: <FigureHeader>Batch size</FigureHeader>,
            cell: (mapping: EventSourceMappingConfiguration) => (
              <Figure>{mapping.BatchSize}</Figure>
            ),
          },
          { id: "starting-position", header: "Starting position", cell: startingPositionText },
        ]),
  ];

  const addButton = <Button onClick={() => setAdding(true)}>Add trigger</Button>;
  const barActions: BarAction[] = [
    refreshAction(triggers),
    { id: "add", text: "Add trigger", onClick: () => setAdding(true) },
  ];

  return (
    <SpaceBetween size='l'>
      <BrokenTriggersAlert mappings={triggers.data ?? []} onRemoved={triggers.refetch} />
      <Table
        variant='container'
        items={triggers.data ?? []}
        trackBy='UUID'
        loading={triggers.isLoading}
        loadingText='Loading Lambda triggers'
        columnDefinitions={columns}
        wrapLines
        empty={emptyOrError(triggers, <EmptyState title='No Lambda triggers' action={addButton} />)}
        header={
          <Header
            counter={triggers.data ? `(${count})` : undefined}
            // Câu cần chú ý đặt ngay đầu khối: stream có mà chưa có Lambda nào đọc
            description={
              triggers.data && count === 0 ? "No Lambda reads this stream yet." : description
            }
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Lambda triggers
          </Header>
        }
      />
      {adding && <StreamTriggerModal {...modalProps} onDismiss={() => setAdding(false)} />}
    </SpaceBetween>
  );
}
