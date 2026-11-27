import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import Link from "@cloudscape-design/components/link";
import { dynamodbRoutes } from "../../dynamodb/routes.ts";
import { s3Routes } from "../../s3/routes.ts";
import { QueueLink } from "../../sqs/components/QueueLink.tsx";
import { TopicLink } from "../../sns/components/TopicLink.tsx";
import {
  EVENT_SOURCE_STATES,
  SOURCE_LABELS,
  TRIGGER_SOURCES,
  VIEW_ONLY_SOURCES,
  type TriggerRowSource,
} from "../constants.ts";
import {
  useAddTrigger,
  useDeleteTrigger,
  useEditTrigger,
  useSetTriggerEnabled,
  useTriggers,
  type TriggerRow,
} from "../hooks/useTriggers.ts";
import type { TriggerFormOutput } from "../schemas.ts";
import { OtherSenders } from "../../integrations/components/OtherSenders.tsx";
import { AddTriggerModal } from "./AddTriggerModal.tsx";
import { EditTriggerModal } from "./EditTriggerModal.tsx";

const MODALS = { add: "add", edit: "edit", delete: "delete" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

function StateCell({ row }: { row: TriggerRow }) {
  if (!row.state) return <>{NOT_AVAILABLE}</>;
  const enabled = row.state === EVENT_SOURCE_STATES.enabled;
  return <StatusIndicator type={enabled ? "success" : "stopped"}>{row.state}</StatusIndicator>;
}

const sourceColumn: TableProps.ColumnDefinition<TriggerRow> = {
  id: "source",
  header: "Source",
  cell: (row) => SOURCE_LABELS[row.source],
};

const RESOURCE_NOUNS: Record<TriggerRowSource, string> = {
  s3: "bucket",
  sqs: "queue",
  dynamodb: "table",
  kinesis: "stream",
  sns: "topic",
  eventbridge: "rule",
  scheduler: "schedule",
  cognito: "user pool",
  apigateway: "API",
};

// Nguồn có trang trên console thì tên là link; nguồn chưa có trang (Kinesis) để chữ
const RESOURCE_HREFS: Partial<Record<TriggerRowSource, (name: string) => string>> = {
  s3: (bucket) => s3Routes.bucket(bucket),
  dynamodb: (table) => dynamodbRoutes.table(table),
};

function ResourceCell({ row }: { row: TriggerRow }) {
  const follow = useFollow();

  if (row.href)
    return (
      <Link href={row.href} onFollow={follow}>
        {row.resource}
      </Link>
    );

  if (row.source === "sqs") return <QueueLink name={row.resource} />;
  if (row.source === "sns") return <TopicLink name={row.resource} />;
  const href = RESOURCE_HREFS[row.source]?.(row.resource);
  if (!href) return <>{row.resource}</>;

  return (
    <Link href={href} onFollow={follow}>
      {row.resource}
    </Link>
  );
}

const resourceColumn: TableProps.ColumnDefinition<TriggerRow> = {
  id: "resource",
  header: "Resource",
  isRowHeader: true,
  cell: (row) => <ResourceCell row={row} />,
};

const detailsColumn: TableProps.ColumnDefinition<TriggerRow> = {
  id: "details",
  header: "Details",
  cell: (row) => row.details,
};

const stateColumn: TableProps.ColumnDefinition<TriggerRow> = {
  id: "state",
  header: "State",
  cell: (row) => <StateCell row={row} />,
};

// Function nhận đích async của function khác; S3, SNS, EventBridge đã có dòng trong bảng trên
const FUNCTION_SENDER_KINDS = ["lambda"] as const;
const EDITABLE_SOURCES: TriggerRowSource[] = ["sqs", "dynamodb"];

const WIDE_COLUMNS = [sourceColumn, resourceColumn, detailsColumn, stateColumn];
// Details cũng hiện ở khung hẹp (bảng xếp dọc): filter, partial batch, đích lỗi không được ẩn
const COMPACT_COLUMNS = [sourceColumn, resourceColumn, detailsColumn, stateColumn];

// Nút "Upload a file" trong thông báo, để thử luồng S3 → Lambda ngay
function UploadButton({ bucket }: { bucket: string }) {
  const follow = useFollow();

  return (
    <Button href={s3Routes.upload(bucket)} onFollow={follow}>
      Upload a file
    </Button>
  );
}

interface Props {
  functionName: string;
  functionArn: string;
}

export function TriggersTab({ functionName, functionArn }: Props) {
  const { ref, compact } = useIsCompact();
  const triggers = useTriggers(functionName, functionArn);
  const addTrigger = useAddTrigger(functionName, functionArn);
  const deleteTrigger = useDeleteTrigger(functionName);
  const editTrigger = useEditTrigger(functionName);
  const setEnabled = useSetTriggerEnabled(functionName);
  const [selected, setSelected] = useState<TriggerRow[]>([]);
  const [openModal, setOpenModal] = useState<ModalId | null>(null);
  const rows = triggers.data ?? [];
  const single = selected[0];
  // Bật/tắt được mọi trigger dạng event source mapping (SQS, DynamoDB)
  const mappingSelected = single?.uuid ? single : undefined;
  const closeModal = () => setOpenModal(null);

  const finish = () => {
    closeModal();
    setSelected([]);
  };

  const add = (values: TriggerFormOutput) =>
    addTrigger.mutate(
      values,
      notifyOutcome({
        success: `Added ${TRIGGER_SOURCES[values.source]} trigger`,
        successAction: values.source === "s3" ? <UploadButton bucket={values.bucket} /> : undefined,
        errorHeader: "Couldn't add the trigger",
        then: closeModal,
      }),
    );

  const remove = () =>
    deleteTrigger.mutate(
      single,
      notifyOutcome({
        success: `Deleted ${SOURCE_LABELS[single.source]} trigger`,
        errorHeader: "Couldn't delete the trigger",
        then: finish,
      }),
    );

  const edit = (values: Parameters<typeof editTrigger.mutate>[0]) =>
    editTrigger.mutate(
      values,
      notifyOutcome({
        success: `Updated trigger ${values.row.resource}`,
        errorHeader: "Couldn't update the trigger",
        then: finish,
      }),
    );

  const toggle = (enabled: boolean) =>
    mappingSelected &&
    setEnabled.mutate(
      { uuid: mappingSelected.uuid!, enabled },
      notifyOutcome({
        success: `${enabled ? "Enabled" : "Disabled"} trigger ${mappingSelected.resource}`,
        errorHeader: "Couldn't change the trigger",
        then: () => setSelected([]),
      }),
    );

  const isEnabled = mappingSelected?.state === EVENT_SOURCE_STATES.enabled;

  const actions: BarAction[] = [
    refreshAction(triggers),
    {
      id: "enable",
      text: "Enable",
      disabled: !mappingSelected || isEnabled,
      loading: setEnabled.isPending && !isEnabled,
      onClick: () => toggle(true),
    },
    {
      id: "disable",
      text: "Disable",
      disabled: !mappingSelected || !isEnabled,
      loading: setEnabled.isPending && isEnabled,
      onClick: () => toggle(false),
    },
    {
      id: "edit",
      text: "Edit",
      // Chỉ SQS và DynamoDB có tùy chọn để sửa; Kinesis chưa có form
      disabled: !single?.mapping || !EDITABLE_SOURCES.includes(single.source),
      onClick: () => setOpenModal(MODALS.edit),
    },
    { id: "delete", text: "Delete", disabled: !single, onClick: () => setOpenModal(MODALS.delete) },
    { id: "add", text: "Add trigger", primary: true, onClick: () => setOpenModal(MODALS.add) },
  ];

  const header = (
    <Header
      counter={triggers.data ? `(${rows.length})` : undefined}
      description='Run the function when objects change in S3, messages arrive in SQS, items change in DynamoDB, a topic publishes in SNS, an EventBridge rule or schedule fires, or an API Gateway route is called.'
      actions={<ActionBar compact={compact} actions={actions} />}
    >
      Triggers
    </Header>
  );

  const empty = emptyOrError(
    triggers,
    <EmptyState
      title='No triggers'
      description='Add an S3, SQS or DynamoDB trigger to run this function. SNS subscriptions and EventBridge rules are added from their own pages. API Gateway routes show here once the API has permission to invoke the function.'
    />,
  );

  // Trigger S3 thực chất là event notification của bucket
  const deleteNotice =
    single?.source === "s3" ? (
      <Box>
        This removes the event notification from bucket <b>{single.resource}</b>: {single.details}
      </Box>
    ) : single?.source === "sns" ? (
      <Box>
        This removes the subscription of topic <b>{single.resource}</b> to this function.
      </Box>
    ) : (
      <Box>
        This removes the {SOURCE_LABELS[single?.source ?? "sqs"]} trigger for{" "}
        {RESOURCE_NOUNS[single?.source ?? "sqs"]} {single?.resource}.
      </Box>
    );

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Table
          variant='container'
          selectionType='single'
          ariaLabels={selectionLabels<TriggerRow>(
            "trigger",
            (item) => `${item.resource} ${item.id}`,
          )}
          trackBy='id'
          items={rows}
          selectedItems={selected}
          onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
          loading={triggers.isLoading}
          loadingText='Loading triggers'
          // Nguồn chỉ xem ở đây nên không chọn được (không có gì để xóa hay bật / tắt)
          isItemDisabled={(row) => VIEW_ONLY_SOURCES.includes(row.source)}
          columnDefinitions={compact ? COMPACT_COLUMNS : WIDE_COLUMNS}
          wrapLines
          empty={empty}
          header={header}
        />
        <OtherSenders arn={functionArn} kinds={FUNCTION_SENDER_KINDS} />
      </SpaceBetween>
      {openModal === MODALS.add && (
        <AddTriggerModal
          linkedSourceArns={(triggers.data ?? []).flatMap((row) => row.sourceArn ?? [])}
          saving={addTrigger.isPending}
          onSave={add}
          onDismiss={closeModal}
        />
      )}
      {openModal === MODALS.edit && single && (
        <EditTriggerModal
          row={single}
          saving={editTrigger.isPending}
          onSave={({ batchSize, options }) => edit({ row: single, batchSize, options })}
          onDismiss={closeModal}
        />
      )}
      {single && (
        <ConfirmModal
          visible={openModal === MODALS.delete}
          header='Delete trigger?'
          actionText='Delete'
          loading={deleteTrigger.isPending}
          onConfirm={remove}
          onDismiss={closeModal}
        >
          {deleteNotice}
        </ConfirmModal>
      )}
    </div>
  );
}
