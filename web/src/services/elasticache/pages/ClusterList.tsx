import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { ClusterStatus } from "../components/ClusterStatus.tsx";
import { DeleteClustersModal } from "../components/DeleteClustersModal.tsx";
import { addressText, engineLabel, useClusters, type Cluster } from "../hooks/useClusters.ts";
import { elasticacheBaseCrumbs, elasticacheRoutes } from "../routes.ts";

const ID_FIELD = "id";
const PAGE_SIZE = 50;

function ClusterName({
  cluster,
  follow,
}: {
  cluster: Cluster;
  follow: ReturnType<typeof useFollow>;
}) {
  return (
    <SpaceBetween direction='horizontal' size='xs' alignItems='center'>
      <Link href={elasticacheRoutes.cluster(cluster.id)} onFollow={follow}>
        {cluster.id}
      </Link>
      <ClusterStatus status={cluster.status} />
    </SpaceBetween>
  );
}

// Copy endpoint ngay trong ô: việc dev làm nhiều nhất ở màn này
const EndpointCell = ({ cluster }: { cluster: Cluster }) =>
  cluster.endpoint ? (
    <CopyButton
      variant='inline'
      text={addressText(cluster.endpoint)}
      label={addressText(cluster.endpoint)}
    />
  ) : (
    <>{NOT_AVAILABLE}</>
  );

export function ClusterList() {
  useBreadcrumbs(elasticacheBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const clusters = useClusters();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={elasticacheRoutes.createCluster} onFollow={follow}>
      Create cluster
    </Button>
  );

  const emptyState = emptyOrError(
    clusters,
    <EmptyState
      title='No clusters'
      description={`You don't have any clusters in ${region}.`}
      action={createButton}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Cluster>(clusters.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: ID_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<Cluster> = {
    id: "name",
    header: "Name",
    sortingField: ID_FIELD,
    isRowHeader: true,
    cell: (cluster) => <ClusterName cluster={cluster} follow={follow} />,
  };
  const engineColumn: TableProps.ColumnDefinition<Cluster> = {
    id: "engine",
    header: "Engine",
    cell: (cluster) => engineLabel(cluster.engine),
  };
  const wideColumns: TableProps.ColumnDefinition<Cluster>[] = [
    nameColumn,
    engineColumn,
    { id: "endpoint", header: "Endpoint", cell: (cluster) => <EndpointCell cluster={cluster} /> },
    {
      id: "nodes",
      header: <FigureHeader>Nodes</FigureHeader>,
      cell: (cluster) => <Figure>{cluster.nodes.length}</Figure>,
    },
  ];
  // Khung hẹp: tầng 1 là tên + engine; tầng 2 là endpoint (vẫn copy được) và số node, xám
  const compactColumns: TableProps.ColumnDefinition<Cluster>[] = [
    {
      ...nameColumn,
      cell: (cluster) => (
        <div>
          <ClusterName cluster={cluster} follow={follow} />
          <Box variant='small' display='block' color='text-body-secondary'>
            <SpaceBetween direction='horizontal' size='xxs' alignItems='center'>
              {cluster.endpoint && <EndpointCell cluster={cluster} />}
              {cluster.endpoint && DETAIL_SEPARATOR}
              {pluralize(cluster.nodes.length, "node")}
            </SpaceBetween>
          </Box>
        </div>
      ),
    },
    engineColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(clusters),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create cluster", primary: true, href: elasticacheRoutes.createCluster },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={clusters.data ? `(${clusters.data.length})` : undefined}
      description={`Data in clusters is cleared when Floci restarts. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Clusters
    </Header>
  );

  const filter = (
    <TextFilter
      {...filterProps}
      filteringPlaceholder='Find clusters by name'
      countText={`${filteredItemsCount ?? 0} matches`}
    />
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        trackBy={ID_FIELD}
        items={items}
        loading={clusters.isLoading}
        loadingText='Loading clusters'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteClustersModal
          clusters={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
