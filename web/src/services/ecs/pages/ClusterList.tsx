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
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, pluralize } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { CreateClusterModal } from "../components/CreateClusterModal.tsx";
import { DeleteClustersModal } from "../components/DeleteClustersModal.tsx";
import { type ClusterRow, ecsRoutes } from "@localconsole/core/ecs";
import { useClusters } from "../hooks/useClusters.ts";
import { ecsClusterCrumbs } from "../routes.ts";

const NAME_FIELD = "name";

export function ClusterList() {
  useBreadcrumbs(ecsClusterCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const clusters = useClusters();
  const [modal, setModal] = useState<"create" | "delete">();

  const createButton = <Button onClick={() => setModal("create")}>Create cluster</Button>;

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<ClusterRow>(clusters.data ?? [], {
      filtering: {
        empty: emptyOrError(
          clusters,
          <EmptyState
            title='No clusters'
            description={`You don't have any clusters in ${region}.`}
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
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setModal(undefined);
    actions.setSelectedItems([]);
  };

  const nameLink = (cluster: ClusterRow) => (
    <Link href={ecsRoutes.cluster(cluster.name)} onFollow={follow}>
      {cluster.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<ClusterRow> = {
    id: "name",
    header: "Cluster",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const figureColumn = (
    id: keyof ClusterRow & string,
    header: string,
    value: (cluster: ClusterRow) => number,
  ): TableProps.ColumnDefinition<ClusterRow> => ({
    id,
    header: <FigureHeader>{header}</FigureHeader>,
    sortingField: id,
    cell: (cluster) => <Figure>{value(cluster)}</Figure>,
  });

  const wideColumns = [
    nameColumn,
    figureColumn("activeServices", "Services", (cluster) => cluster.activeServices),
    figureColumn("runningTasks", "Running tasks", (cluster) => cluster.runningTasks),
    figureColumn("pendingTasks", "Pending tasks", (cluster) => cluster.pendingTasks),
  ];
  // Khung hẹp: tầng 2 là số service · số task đang chạy, màu xám
  const compactColumns: TableProps.ColumnDefinition<ClusterRow>[] = [
    {
      ...nameColumn,
      cell: (cluster) => (
        <div>
          {nameLink(cluster)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[
              pluralize(cluster.activeServices, "service"),
              pluralize(cluster.runningTasks, "running task"),
            ].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(clusters),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setModal("delete") },
    { id: "create", text: "Create cluster", primary: true, onClick: () => setModal("create") },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={clusters.data ? `(${clusters.data.length})` : undefined}
      description={`Clusters group the services and tasks Floci runs as Docker containers. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Clusters
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<ClusterRow>("cluster", (item) => item.name)}
        trackBy={NAME_FIELD}
        items={items}
        loading={clusters.isLoading}
        loadingText='Loading clusters'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find clusters by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {modal === "create" && <CreateClusterModal onDismiss={() => setModal(undefined)} />}
      {modal === "delete" && (
        <DeleteClustersModal
          names={selected.map((cluster) => cluster.name)}
          onDismiss={() => setModal(undefined)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
