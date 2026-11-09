import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { s3Routes } from "../../s3/routes.ts";
import { EVENT_SOURCE_STATES, TRIGGER_SOURCES } from "../constants.ts";
import {
  useAddTrigger,
  useDeleteTrigger,
  useSetTriggerEnabled,
  useTriggers,
  type TriggerRow,
} from "../hooks/useTriggers.ts";
import type { TriggerFormOutput } from "../schemas.ts";
import { AddTriggerModal } from "./AddTriggerModal.tsx";

const MODALS = { add: "add", delete: "delete" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

function StateCell({ row }: { row: TriggerRow }) {
  if (!row.state) return <>{NOT_AVAILABLE}</>;
  const enabled = row.state === EVENT_SOURCE_STATES.enabled;
  return <StatusIndicator type={enabled ? "success" : "stopped"}>{row.state}</StatusIndicator>;
}

const sourceColumn: TableProps.ColumnDefinition<TriggerRow> = {
  id: "source",
  header: "Source",
  cell: (row) => TRIGGER_SOURCES[row.source],
};
const resourceColumn: TableProps.ColumnDefinition<TriggerRow> = {
  id: "resource",
  header: "Resource",
  isRowHeader: true,
  cell: (row) => row.resource,
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

const WIDE_COLUMNS = [sourceColumn, resourceColumn, detailsColumn, stateColumn];
const COMPACT_COLUMNS = [sourceColumn, resourceColumn, stateColumn];

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
  const setEnabled = useSetTriggerEnabled(functionName);
  const [selected, setSelected] = useState<TriggerRow[]>([]);
  const [openModal, setOpenModal] = useState<ModalId | null>(null);
  const rows = triggers.data ?? [];
  const single = selected[0];
  const sqsSelected = single?.source === "sqs" ? single : undefined;
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
        success: `Deleted ${TRIGGER_SOURCES[single.source]} trigger`,
        errorHeader: "Couldn't delete the trigger",
        then: finish,
      }),
    );

  const toggle = (enabled: boolean) =>
    sqsSelected &&
    setEnabled.mutate(
      { uuid: sqsSelected.uuid!, enabled },
      notifyOutcome({
        success: `${enabled ? "Enabled" : "Disabled"} trigger ${sqsSelected.resource}`,
        errorHeader: "Couldn't change the trigger",
        then: () => setSelected([]),
      }),
    );

  const isEnabled = sqsSelected?.state === EVENT_SOURCE_STATES.enabled;
  const actions: BarAction[] = [
    refreshAction(triggers),
    {
      id: "enable",
      text: "Enable",
      disabled: !sqsSelected || isEnabled,
      loading: setEnabled.isPending && !isEnabled,
      onClick: () => toggle(true),
    },
    {
      id: "disable",
      text: "Disable",
      disabled: !sqsSelected || !isEnabled,
      loading: setEnabled.isPending && isEnabled,
      onClick: () => toggle(false),
    },
    { id: "delete", text: "Delete", disabled: !single, onClick: () => setOpenModal(MODALS.delete) },
    { id: "add", text: "Add trigger", primary: true, onClick: () => setOpenModal(MODALS.add) },
  ];

  const header = (
    <Header
      counter={triggers.data ? `(${rows.length})` : undefined}
      description='Run the function when objects change in an S3 bucket or messages arrive in an SQS queue.'
      actions={<ActionBar compact={compact} actions={actions} />}
    >
      Triggers
    </Header>
  );

  const empty = emptyOrError(
    triggers,
    <EmptyState title='No triggers' description='Add an S3 or SQS trigger to run this function.' />,
  );

  // Trigger S3 thực chất là event notification của bucket
  const deleteNotice =
    single?.source === "s3" ? (
      <Box>
        This removes the event notification from bucket <b>{single.resource}</b>: {single.details}
      </Box>
    ) : (
      <Box>This removes the SQS trigger for queue {single?.resource}.</Box>
    );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        selectionType='single'
        trackBy='id'
        items={rows}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={triggers.isLoading}
        loadingText='Loading triggers'
        columnDefinitions={compact ? COMPACT_COLUMNS : WIDE_COLUMNS}
        wrapLines
        empty={empty}
        header={header}
      />
      {openModal === MODALS.add && (
        <AddTriggerModal saving={addTrigger.isPending} onSave={add} onDismiss={closeModal} />
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
