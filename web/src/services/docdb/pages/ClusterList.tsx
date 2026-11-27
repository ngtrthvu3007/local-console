import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, pluralize } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { type ClusterRow, docdbRoutes } from "@localconsole/core/docdb";
import { DeleteClustersModal } from "../components/DeleteClustersModal.tsx";
import { CLUSTER_STATUS_STYLES } from "../constants.ts";
import { useClusters } from "../hooks/useClusters.ts";
import { docdbBaseCrumbs } from "../routes.ts";

const ID_FIELD = "id";

const endpointText = (cluster: ClusterRow) =>
  cluster.endpoint ? `${cluster.endpoint}:${cluster.port}` : NOT_AVAILABLE;

export function ClusterList() {
  useBreadcrumbs(docdbBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const clusters = useClusters();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button href={docdbRoutes.createCluster} onFollow={follow}>
      Create cluster
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<ClusterRow>(clusters.data ?? [], {
      filtering: {
        empty: emptyOrError(
          clusters,
          <EmptyState
            title='No clusters'
            description={`You don't have any DocumentDB clusters in ${region}.`}
            action={createButton}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: ID_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });
  const selected = collectionProps.selectedItems ?? [];

  const idLink = (cluster: ClusterRow) => (
    <Link href={docdbRoutes.cluster(cluster.id)} onFollow={follow}>
      {cluster.id}
    </Link>
  );
  const idColumn: TableProps.ColumnDefinition<ClusterRow> = {
    id: "id",
    header: "Cluster",
    sortingField: ID_FIELD,
    isRowHeader: true,
    cell: idLink,
  };
  const statusColumn: TableProps.ColumnDefinition<ClusterRow> = {
    id: "status",
    header: "Status",
    cell: (cluster) => <StatusBadge status={cluster.status} styles={CLUSTER_STATUS_STYLES} />,
  };

  const wideColumns: TableProps.ColumnDefinition<ClusterRow>[] = [
    idColumn,
    statusColumn,
    {
      id: "instances",
      header: <FigureHeader>Instances</FigureHeader>,
      cell: (cluster) => <Figure>{cluster.instances.length}</Figure>,
    },
    { id: "endpoint", header: "Endpoint", cell: endpointText },
  ];
  // Khung hẹp: tầng 2 là số instance · endpoint, màu xám
  const compactColumns: TableProps.ColumnDefinition<ClusterRow>[] = [
    {
      ...idColumn,
      cell: (cluster) => (
        <div>
          {idLink(cluster)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[pluralize(cluster.instances.length, "instance"), endpointText(cluster)].join(
              DETAIL_SEPARATOR,
            )}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(clusters),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create cluster", primary: true, href: docdbRoutes.createCluster },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<ClusterRow>("cluster", (item) => item.id)}
        trackBy={ID_FIELD}
        items={items}
        loading={clusters.isLoading}
        loadingText='Loading clusters'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            variant='awsui-h1-sticky'
            counter={clusters.data ? `(${clusters.data.length})` : undefined}
            description={`MongoDB-compatible clusters Floci runs as MongoDB containers. Region: ${region}.`}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Clusters
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find clusters by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteClustersModal
          clusters={selected}
          onDismiss={() => setDeleting(false)}
          onDone={() => {
            setDeleting(false);
            actions.setSelectedItems([]);
          }}
        />
      )}
    </div>
  );
}
