import type { Shard, StreamDescriptionSummary } from "@aws-sdk/client-kinesis";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { emptyOrError } from "@shared/components/TableStates.tsx";
import { KIBIBYTE, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes, formatDate, pluralize } from "@shared/format.ts";
import { KeyLink } from "../../kms/components/KeyLink.tsx";
import { streamSample } from "../codeSamples.ts";
import { useShards } from "../hooks/useStreams.ts";
import { isShardOpen, streamModeLabel } from "../recordData.ts";
import { STREAM_STATUS_STYLES } from "../constants.ts";

const DETAILS_COLUMNS = 3;
const NO_ENCRYPTION = "NONE";

const shardColumns: TableProps.ColumnDefinition<Shard>[] = [
  { id: "id", header: "Shard ID", isRowHeader: true, cell: (shard) => shard.ShardId },
  { id: "parent", header: "Parent shard", cell: (shard) => shard.ParentShardId ?? NOT_AVAILABLE },
  {
    id: "state",
    header: "State",
    cell: (shard) =>
      isShardOpen(shard) ? (
        <StatusIndicator type='success'>Open</StatusIndicator>
      ) : (
        <StatusIndicator type='stopped'>Closed</StatusIndicator>
      ),
  },
];

function Encryption({ stream }: { stream: StreamDescriptionSummary }) {
  if (!stream.EncryptionType || stream.EncryptionType === NO_ENCRYPTION) return <>Not encrypted</>;
  if (!stream.KeyId) return <>{stream.EncryptionType}</>;
  return (
    <>
      {stream.EncryptionType} · <KeyLink value={stream.KeyId} />
    </>
  );
}

export function ConfigurationTab({ stream }: { stream: StreamDescriptionSummary }) {
  const name = stream.StreamName ?? "";
  const shards = useShards(name);
  const retention = stream.RetentionPeriodHours;

  return (
    <SpaceBetween size='l'>
      <Container header={<Header variant='h2'>Data stream configuration</Header>}>
        <KeyValuePairs
          columns={DETAILS_COLUMNS}
          items={[
            { label: "ARN", value: copyable(stream.StreamARN) },
            {
              label: "Status",
              value: <StatusBadge status={stream.StreamStatus} styles={STREAM_STATUS_STYLES} />,
            },
            {
              label: "Capacity mode",
              value: streamModeLabel(stream.StreamModeDetails?.StreamMode),
            },
            {
              label: "Data retention",
              value: retention === undefined ? NOT_AVAILABLE : pluralize(retention, "hour"),
            },
            { label: "Encryption", value: <Encryption stream={stream} /> },
            {
              label: "Maximum record size",
              value:
                stream.MaxRecordSizeInKiB === undefined
                  ? NOT_AVAILABLE
                  : formatBytes(stream.MaxRecordSizeInKiB * KIBIBYTE),
            },
            { label: "Created", value: formatDate(stream.StreamCreationTimestamp) },
          ]}
        />
      </Container>
      <ConnectCard sample={streamSample(name)} />
      <Table
        items={shards.data ?? []}
        trackBy='ShardId'
        loading={shards.isLoading}
        loadingText='Loading shards'
        columnDefinitions={shardColumns}
        empty={emptyOrError(shards, "No shards")}
        header={
          <Header variant='h2' counter={shards.data ? `(${shards.data.length})` : undefined}>
            Shards
          </Header>
        }
      />
    </SpaceBetween>
  );
}
