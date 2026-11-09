import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { REDIS_ERROR_CODES } from "@server/routes/redis/contract.ts";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { EmptyState, ErrorState } from "@shared/components/TableStates.tsx";
import { ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes, formatDate, formatDuration } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { CLUSTER_STATUS_AVAILABLE, NODE_ROLE_LABELS, REDIS_URL_SCHEME } from "../constants.ts";
import {
  addressText,
  engineLabel,
  isTransitional,
  type Address,
  type Cluster,
  type ClusterNode,
} from "../hooks/useClusters.ts";
import { errorCode, useServerInfo } from "../hooks/useRedis.ts";
import { ClusterStatus } from "./ClusterStatus.tsx";

const CONNECT_COLUMNS = 3;
const SERVER_COLUMNS = 4;
const GENERAL_COLUMNS = 4;

const copyable = (text?: string) =>
  text ? <CopyButton variant='inline' text={text} label={text} /> : NOT_AVAILABLE;

const connectionString = (host: string, port: number) => `${REDIS_URL_SCHEME}${host}:${port}`;

// Khung hẹp: một cột, để endpoint và connection string không bị bẻ giữa chữ
const columnsFor = (compact: boolean, columns: number) => (compact ? 1 : columns);

function ConnectBlock({
  endpoint,
  readerEndpoint,
  compact,
}: {
  endpoint?: Address;
  readerEndpoint?: Address;
  compact: boolean;
}) {
  // BE chạy trong cùng docker compose gọi Floci bằng tên service (vd: floci), không phải localhost
  const flociHost = new URL(useLoadedConfig().flociInternalUrl).hostname;
  const items: KeyValuePairsProps.Item[] = [
    { label: "Endpoint", value: copyable(endpoint && addressText(endpoint)) },
    { label: "Port", value: endpoint ? String(endpoint.port) : NOT_AVAILABLE },
    {
      label: "Connection string",
      value: copyable(endpoint && connectionString(endpoint.host, endpoint.port)),
    },
  ];
  // Cluster một node có reader endpoint trùng primary: chỉ hiện khi khác
  if (readerEndpoint && endpoint && addressText(readerEndpoint) !== addressText(endpoint)) {
    items.push({ label: "Reader endpoint", value: copyable(addressText(readerEndpoint)) });
  }
  return (
    <Container header={<Header variant='h2'>Connect</Header>}>
      <SpaceBetween size='m'>
        <KeyValuePairs columns={columnsFor(compact, CONNECT_COLUMNS)} items={items} />
        {endpoint && (
          <Box color='text-body-secondary'>
            From containers in the same docker compose:{" "}
            {copyable(connectionString(flociHost, endpoint.port))}
          </Box>
        )}
      </SpaceBetween>
    </Container>
  );
}

function ServerBlock({ cluster, compact }: { cluster: Cluster; compact: boolean }) {
  const info = useServerInfo(cluster.id, !isTransitional(cluster));

  const content = () => {
    if (isTransitional(cluster)) {
      return <StatusIndicator type='in-progress'>Cluster is {cluster.status}</StatusIndicator>;
    }
    if (errorCode(info.error) === REDIS_ERROR_CODES.unsupportedCluster) {
      return (
        <EmptyState title="Server info isn't available" description={errorMessage(info.error)} />
      );
    }
    if (info.isError) return <ErrorState error={info.error} onRetry={() => info.refetch()} />;
    const loading = <StatusIndicator type='loading'>Loading</StatusIndicator>;
    const data = info.data;
    const items: KeyValuePairsProps.Item[] = [
      { label: "Memory used", value: data ? formatBytes(data.memoryUsedBytes) : loading },
      // Kết nối của chính console cũng được tính
      {
        label: "Connected clients",
        value: data ? data.clients.toLocaleString() : loading,
      },
      { label: "Keys", value: data ? data.keys.toLocaleString() : loading },
      {
        label: "Version",
        value: data ? `${engineLabel(data.engine)} ${data.version}` : loading,
      },
      { label: "Uptime", value: data ? formatDuration(data.uptimeSeconds) : loading },
    ];
    return <KeyValuePairs columns={columnsFor(compact, SERVER_COLUMNS)} items={items} />;
  };

  return (
    <Container
      header={
        <Header
          variant='h2'
          description='Live from the cluster. Connected clients include this console.'
          actions={<ActionBar compact={false} actions={[refreshAction(info)]} />}
        >
          Server
        </Header>
      }
    >
      {content()}
    </Container>
  );
}

export function DetailsTab({ cluster }: { cluster: Cluster }) {
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);

  const generalItems: KeyValuePairsProps.Item[] = [
    { label: "Engine", value: engineLabel(cluster.engine) },
    { label: "Engine version", value: cluster.engineVersion ?? NOT_AVAILABLE },
    {
      label: "Status",
      value:
        cluster.status === CLUSTER_STATUS_AVAILABLE ? (
          cluster.status
        ) : (
          <ClusterStatus status={cluster.status} />
        ),
    },
    { label: "Cluster mode", value: cluster.clusterMode ? "On" : "Off" },
    { label: "Node type", value: cluster.nodeType ?? NOT_AVAILABLE },
    { label: "Created", value: formatDate(cluster.createdAt) },
    { label: "ARN", value: copyable(cluster.arn) },
  ];

  const roleText = (node: ClusterNode) =>
    node.role ? (NODE_ROLE_LABELS[node.role] ?? node.role) : NOT_AVAILABLE;
  const nodeColumns: TableProps.ColumnDefinition<ClusterNode>[] = compact
    ? [
        {
          id: "node",
          header: "Node",
          isRowHeader: true,
          cell: (node) => (
            <div>
              {node.id} <ClusterStatus status={node.status} />
              <Box variant='small' display='block' color='text-body-secondary'>
                {roleText(node)}
              </Box>
            </div>
          ),
        },
      ]
    : [
        { id: "id", header: "Node ID", isRowHeader: true, cell: (node) => node.id },
        { id: "role", header: "Role", cell: roleText },
        {
          id: "status",
          header: "Status",
          // Chỉ hiện khi khác available
          cell: (node) =>
            node.status && node.status !== CLUSTER_STATUS_AVAILABLE ? (
              <ClusterStatus status={node.status} />
            ) : (
              NOT_AVAILABLE
            ),
        },
      ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <ConnectBlock
          endpoint={cluster.endpoint}
          readerEndpoint={cluster.readerEndpoint}
          compact={compact}
        />
        <ServerBlock cluster={cluster} compact={compact} />
        <Container header={<Header variant='h2'>General</Header>}>
          <KeyValuePairs columns={columnsFor(compact, GENERAL_COLUMNS)} items={generalItems} />
        </Container>
        <Table
          variant='container'
          items={cluster.nodes}
          trackBy='id'
          columnDefinitions={nodeColumns}
          wrapLines
          empty={<EmptyState title='No nodes' />}
          header={<Header counter={`(${cluster.nodes.length})`}>Nodes</Header>}
        />
      </SpaceBetween>
    </div>
  );
}
