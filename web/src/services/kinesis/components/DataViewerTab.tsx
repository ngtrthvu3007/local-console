import { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import {
  DETAIL_SEPARATOR,
  NOT_AVAILABLE,
  formatDate,
  truncate,
  reformatJson,
} from "@localconsole/core/shared";
import { ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_ITERATOR_TYPE,
  ITERATOR_TYPES,
  recordText,
  dataViewerSchema,
  type DataViewerForm,
} from "@localconsole/core/kinesis";
import { useRecords, type KinesisRecord } from "../hooks/useRecords.ts";
import { useShards } from "../hooks/useStreams.ts";

const DATA_PREVIEW_LENGTH = 120;
const POSITION_OPTIONS = Object.entries(ITERATOR_TYPES).map(([value, label]) => ({
  value,
  label,
}));
const INITIAL_VALUES: DataViewerForm = {
  shardId: "",
  position: DEFAULT_ITERATOR_TYPE,
  timestamp: "",
};

const dataPreview = (record: KinesisRecord) =>
  truncate(recordText(record.Data).text, DATA_PREVIEW_LENGTH);
const arrivalText = (record: KinesisRecord) => formatDate(record.ApproximateArrivalTimestamp);

// Panel chi tiết: data đầy đủ (JSON thì thụt dòng) và thông tin của record
function RecordDetails({ record }: { record: KinesisRecord }) {
  const data = recordText(record.Data);
  return (
    <SpaceBetween size='l'>
      <CodeSnippet code={data.kind === "json" ? reformatJson(data.text) : data.text} wrap />
      <KeyValuePairs
        items={[
          { label: "Partition key", value: record.PartitionKey ?? NOT_AVAILABLE },
          { label: "Sequence number", value: record.SequenceNumber ?? NOT_AVAILABLE },
          { label: "Arrival time", value: arrivalText(record) },
          { label: "Encryption", value: record.EncryptionType ?? NOT_AVAILABLE },
        ]}
      />
    </SpaceBetween>
  );
}

export function DataViewerTab({ stream }: { stream: string }) {
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const shards = useShards(stream);
  const records = useRecords(stream);
  const form = useZodForm(dataViewerSchema, INITIAL_VALUES);
  const [position, shardId, timestamp] = useWatch({
    control: form.control,
    name: ["position", "shardId", "timestamp"],
  });
  const [openSequence, setOpenSequence] = useState<string>();
  // Shard / vị trí của lần Get records gần nhất: Next records đọc tiếp iterator của lần đó
  const [loadedView, setLoadedView] = useState<DataViewerForm>();
  const viewChanged =
    loadedView !== undefined &&
    (loadedView.shardId !== shardId ||
      loadedView.position !== position ||
      loadedView.timestamp !== timestamp);
  const items = records.page?.records ?? [];
  const openRecord = items.find((record) => record.SequenceNumber === openSequence);

  // Chọn sẵn shard đầu khi danh sách tải xong, trừ khi người dùng đã chọn
  const { getValues, setValue } = form;
  useEffect(() => {
    const first = shards.data?.[0]?.ShardId;
    if (first && !getValues("shardId")) setValue("shardId", first);
  }, [shards.data, getValues, setValue]);

  useSplitPanel(
    openRecord
      ? {
          header: openRecord.SequenceNumber ?? NOT_AVAILABLE,
          description: arrivalText(openRecord),
          onClose: () => setOpenSequence(undefined),
          body: <RecordDetails record={openRecord} />,
        }
      : null,
  );

  const submit = form.handleSubmit((values) => {
    setOpenSequence(undefined);
    setLoadedView(values);
    records.load(values);
  });
  // Đã đọc từ đầu shard mà rỗng thì record (nếu có) nằm ở shard khác, theo partition key
  const emptyHint =
    loadedView?.position === "TRIM_HORIZON"
      ? "This shard has no records. Records go to a shard by partition key: try another shard."
      : "No records from this position. Try Trim horizon to read from the start.";

  const sequenceLink = (record: KinesisRecord) => (
    <Link
      onFollow={(event) => {
        event.preventDefault();
        setOpenSequence(record.SequenceNumber);
      }}
      href='#'
    >
      {/* Record đang mở in đậm, như message đang mở của SQS */}
      {record.SequenceNumber === openSequence ? (
        <strong>{record.SequenceNumber}</strong>
      ) : (
        record.SequenceNumber
      )}
    </Link>
  );

  const wideColumns: TableProps.ColumnDefinition<KinesisRecord>[] = [
    { id: "arrival", header: "Arrival time", cell: arrivalText },
    { id: "key", header: "Partition key", cell: (record) => record.PartitionKey },
    { id: "sequence", header: "Sequence number", isRowHeader: true, cell: sequenceLink },
    { id: "data", header: "Data", cell: dataPreview },
  ];
  // Khung hẹp: tầng 1 là sequence number, tầng 2 là thời điểm · partition key · data, xám
  const compactColumns: TableProps.ColumnDefinition<KinesisRecord>[] = [
    {
      id: "sequence",
      header: "Sequence number",
      isRowHeader: true,
      cell: (record) => (
        <div>
          {sequenceLink(record)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[arrivalText(record), record.PartitionKey, dataPreview(record)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const shardOptions = (shards.data ?? []).map((shard) => ({
    value: shard.ShardId ?? "",
    label: shard.ShardId ?? "",
  }));

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Container>
            <SpaceBetween size='m'>
              <ColumnLayout columns={compact ? 1 : 3}>
                <FormSelect
                  control={form.control}
                  name='shardId'
                  label='Shard'
                  options={shardOptions}
                  placeholder='Choose a shard'
                />
                <FormSelect
                  control={form.control}
                  name='position'
                  label='Starting position'
                  options={POSITION_OPTIONS}
                />
                {position === "AT_TIMESTAMP" && (
                  <FormInput
                    control={form.control}
                    name='timestamp'
                    label='Timestamp'
                    placeholder='2026-11-25 09:00:00'
                  />
                )}
              </ColumnLayout>
              <Button variant='primary' formAction='submit' loading={records.loading}>
                Get records
              </Button>
            </SpaceBetween>
          </Container>
        </form>
        <Table
          variant='container'
          trackBy='SequenceNumber'
          items={items}
          columnDefinitions={compact ? compactColumns : wideColumns}
          wrapLines={compact}
          empty={
            records.page ? (
              <EmptyState title='No records' description={emptyHint} />
            ) : (
              <EmptyState
                title='No records loaded'
                description='Choose a shard and a starting position, then get records.'
              />
            )
          }
          header={
            <Header
              counter={records.page ? `(${items.length})` : undefined}
              actions={
                <Button
                  disabled={!records.page || records.page.atEnd || viewChanged}
                  disabledReason={
                    viewChanged ? "Shard or position changed: get records again." : undefined
                  }
                  loading={records.loading && Boolean(records.page)}
                  onClick={records.next}
                >
                  Next records
                </Button>
              }
            >
              Records
            </Header>
          }
        />
      </SpaceBetween>
    </div>
  );
}
