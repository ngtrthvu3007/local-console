import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import type {
  GlobalSecondaryIndexDescription,
  LocalSecondaryIndexDescription,
  TableDescription,
} from "@aws-sdk/client-dynamodb";
import type { EventSourceMappingConfiguration } from "@aws-sdk/client-lambda";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import {
  EVENT_SOURCE_STATES,
  STARTING_POSITIONS,
  type StartingPosition,
} from "../../lambda/constants.ts";
import { FUNCTION_TABS, lambdaRoutes } from "../../lambda/routes.ts";
import {
  PROJECTION_LABELS,
  STREAM_VIEW_TYPES,
  TTL_STATUS_ENABLED,
  type StreamViewTypeId,
} from "../constants.ts";
import { useStreamTriggers, useTimeToLive } from "../hooks/useTableSettings.ts";
import { keySchemaOf } from "../hooks/useTables.ts";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { KeyLabel, keyText } from "./KeyLabel.tsx";
import { StreamModal, StreamTriggerModal, TimeToLiveModal } from "./SettingsModals.tsx";

const GENERAL_COLUMNS = 4;
const FUNCTION_ARN_MARKER = ":function:";
const MODALS = { ttl: "ttl", stream: "stream", trigger: "trigger" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

interface IndexRow {
  name: string;
  type: "GSI" | "LSI";
  index: GlobalSecondaryIndexDescription | LocalSecondaryIndexDescription;
}

const functionNameOf = (mapping: EventSourceMappingConfiguration) =>
  mapping.FunctionArn?.split(FUNCTION_ARN_MARKER)[1] ?? NOT_AVAILABLE;

const startingPositionText = (mapping: EventSourceMappingConfiguration) =>
  STARTING_POSITIONS[mapping.StartingPosition as StartingPosition] ?? NOT_AVAILABLE;

export function SettingsTab({ table }: { table: TableDescription }) {
  const tableName = table.TableName!;
  const follow = useFollow();
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const keys = keySchemaOf(table);
  const timeToLive = useTimeToLive(tableName);
  const stream = table.StreamSpecification;
  const streamOn = Boolean(stream?.StreamEnabled && table.LatestStreamArn);
  const triggers = useStreamTriggers(tableName, streamOn ? table.LatestStreamArn : undefined);
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);
  const triggerCount = triggers.data?.length ?? 0;

  // ---------- General information ----------

  const generalItems: KeyValuePairsProps.Item[] = [
    { label: "Partition key", value: <KeyLabel attribute={keys.partitionKey} /> },
    { label: "Sort key", value: <KeyLabel attribute={keys.sortKey} /> },
    { label: "Items", value: (table.ItemCount ?? 0).toLocaleString() },
    { label: "Created", value: formatDate(table.CreationDateTime) },
    {
      label: "ARN",
      value: <CopyButton variant='inline' text={table.TableArn} label={table.TableArn} />,
    },
  ];

  // ---------- Indexes ----------

  const indexRows: IndexRow[] = [
    ...(table.GlobalSecondaryIndexes ?? []).map((index) => ({
      name: index.IndexName!,
      type: "GSI" as const,
      index,
    })),
    ...(table.LocalSecondaryIndexes ?? []).map((index) => ({
      name: index.IndexName!,
      type: "LSI" as const,
      index,
    })),
  ];
  const indexKeys = (row: IndexRow) => keySchemaOf(table, row.name);
  const projectionText = (row: IndexRow) =>
    PROJECTION_LABELS[row.index.Projection?.ProjectionType ?? ""] ?? NOT_AVAILABLE;
  const indexColumns: TableProps.ColumnDefinition<IndexRow>[] = compact
    ? [
        {
          id: "index",
          header: "Index",
          isRowHeader: true,
          cell: (row) => (
            <div>
              {row.name} · {row.type}
              <Box variant='small' display='block' color='text-body-secondary'>
                {[
                  keyText(indexKeys(row).partitionKey),
                  indexKeys(row).sortKey && keyText(indexKeys(row).sortKey!),
                  projectionText(row),
                ]
                  .filter(Boolean)
                  .join(DETAIL_SEPARATOR)}
              </Box>
            </div>
          ),
        },
      ]
    : [
        { id: "name", header: "Name", isRowHeader: true, cell: (row) => row.name },
        { id: "type", header: "Type", cell: (row) => row.type },
        {
          id: "partition-key",
          header: "Partition key",
          cell: (row) => <KeyLabel attribute={indexKeys(row).partitionKey} />,
        },
        {
          id: "sort-key",
          header: "Sort key",
          cell: (row) => <KeyLabel attribute={indexKeys(row).sortKey} />,
        },
        { id: "projection", header: "Projection", cell: projectionText },
      ];

  // ---------- TTL và Stream ----------

  const ttlOn = timeToLive.data?.TimeToLiveStatus === TTL_STATUS_ENABLED;
  const ttlBody = timeToLive.isLoading ? (
    <StatusIndicator type='loading'>Loading</StatusIndicator>
  ) : ttlOn ? (
    <SpaceBetween size='xs'>
      <StatusIndicator type='success'>
        On · attribute {timeToLive.data?.AttributeName}
      </StatusIndicator>
      <Box variant='small' color='text-body-secondary'>
        Unix time in seconds. Floci deletes expired items every 60 seconds; until then they can
        still be read.
      </Box>
    </SpaceBetween>
  ) : (
    <Box color='text-body-secondary'>
      Off. Turn it on to delete items after a time stored in one of their attributes.
    </Box>
  );

  const streamBody = streamOn ? (
    <SpaceBetween size='xs'>
      <StatusIndicator type='success'>
        On ·{" "}
        {STREAM_VIEW_TYPES[stream?.StreamViewType as StreamViewTypeId] ?? stream?.StreamViewType}
      </StatusIndicator>
      <CopyButton variant='inline' text={table.LatestStreamArn} label={table.LatestStreamArn} />
    </SpaceBetween>
  ) : (
    <Box color='text-body-secondary'>
      Off. Turn it on to trigger Lambda functions when items change.
    </Box>
  );

  const editButton = (id: ModalId) => (
    <Button onClick={() => setModal(id)} disabled={id === MODALS.ttl && !timeToLive.data}>
      Edit
    </Button>
  );

  // ---------- Lambda triggers ----------

  const triggerColumns: TableProps.ColumnDefinition<EventSourceMappingConfiguration>[] = [
    {
      id: "function",
      header: "Function",
      isRowHeader: true,
      cell: (mapping) => (
        <Link
          href={lambdaRoutes.function(functionNameOf(mapping), FUNCTION_TABS.triggers)}
          onFollow={follow}
        >
          {functionNameOf(mapping)}
        </Link>
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

  const addTriggerButton = <Button onClick={() => setModal(MODALS.trigger)}>Add trigger</Button>;
  // Câu cần chú ý đặt ngay đầu khối: stream bật mà chưa có Lambda nào đọc
  const triggersDescription =
    triggers.data && triggerCount === 0
      ? "No Lambda reads this stream yet."
      : "Functions that run when items in this table change.";

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>General information</Header>}>
          <KeyValuePairs columns={GENERAL_COLUMNS} items={generalItems} />
        </Container>

        <Table
          variant='container'
          items={indexRows}
          trackBy='name'
          columnDefinitions={indexColumns}
          wrapLines
          empty={
            <EmptyState title='No indexes' description='Create the table again to add an index.' />
          }
          header={<Header counter={`(${indexRows.length})`}>Indexes</Header>}
        />

        <ColumnLayout columns={2}>
          <Container
            fitHeight
            header={
              <Header variant='h2' actions={editButton(MODALS.ttl)}>
                Time to Live (TTL)
              </Header>
            }
          >
            {timeToLive.isError ? emptyOrError(timeToLive, null) : ttlBody}
          </Container>
          <Container
            fitHeight
            header={
              <Header variant='h2' actions={editButton(MODALS.stream)}>
                Stream
              </Header>
            }
          >
            {streamBody}
          </Container>
        </ColumnLayout>

        {streamOn && (
          <Table
            variant='container'
            items={triggers.data ?? []}
            trackBy='UUID'
            loading={triggers.isLoading}
            loadingText='Loading Lambda triggers'
            columnDefinitions={triggerColumns}
            wrapLines
            empty={emptyOrError(
              triggers,
              <EmptyState title='No Lambda triggers' action={addTriggerButton} />,
            )}
            header={
              <Header
                counter={triggers.data ? `(${triggerCount})` : undefined}
                description={triggersDescription}
                actions={addTriggerButton}
              >
                Lambda triggers
              </Header>
            }
          />
        )}
      </SpaceBetween>

      {modal === MODALS.ttl && timeToLive.data && (
        <TimeToLiveModal table={tableName} current={timeToLive.data} onDismiss={closeModal} />
      )}
      {modal === MODALS.stream && (
        <StreamModal
          table={tableName}
          current={stream}
          triggerCount={triggerCount}
          onDismiss={closeModal}
        />
      )}
      {modal === MODALS.trigger && table.LatestStreamArn && (
        <StreamTriggerModal
          table={tableName}
          streamArn={table.LatestStreamArn}
          onDismiss={closeModal}
        />
      )}
    </div>
  );
}
