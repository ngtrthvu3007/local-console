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
import type { BrokerSummary } from "@aws-sdk/client-mq";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { BrokerStatus } from "../components/BrokerStatus.tsx";
import { DeleteBrokersModal } from "../components/DeleteBrokersModal.tsx";
import { ENGINE_LABEL } from "../constants.ts";
import { useBrokers } from "../hooks/useBrokers.ts";
import { mqBaseCrumbs, mqRoutes } from "../routes.ts";

const NAME_FIELD = "BrokerName";
const ID_FIELD = "BrokerId";
const PAGE_SIZE = 50;

function BrokerName({
  broker,
  follow,
}: {
  broker: BrokerSummary;
  follow: ReturnType<typeof useFollow>;
}) {
  return (
    <SpaceBetween direction='horizontal' size='xs' alignItems='center'>
      <Link href={mqRoutes.broker(broker.BrokerId!)} onFollow={follow}>
        {broker.BrokerName}
      </Link>
      <BrokerStatus state={broker.BrokerState} />
    </SpaceBetween>
  );
}

export function BrokerList() {
  useBreadcrumbs(mqBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const brokers = useBrokers();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={mqRoutes.createBroker} onFollow={follow}>
      Create broker
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<BrokerSummary>(brokers.data ?? [], {
      filtering: {
        empty: emptyOrError(
          brokers,
          <EmptyState
            title='No brokers'
            description={`You don't have any brokers in ${region}.`}
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
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<BrokerSummary> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: (broker) => <BrokerName broker={broker} follow={follow} />,
  };
  const wideColumns: TableProps.ColumnDefinition<BrokerSummary>[] = [
    nameColumn,
    { id: "engine", header: "Engine", cell: () => ENGINE_LABEL },
    {
      id: "created",
      header: "Created",
      sortingField: "Created",
      cell: (broker) => formatDate(broker.Created),
    },
  ];
  // Khung hẹp: tầng 1 là tên, tầng 2 là engine · ngày tạo, xám
  const compactColumns: TableProps.ColumnDefinition<BrokerSummary>[] = [
    {
      ...nameColumn,
      cell: (broker) => (
        <div>
          <BrokerName broker={broker} follow={follow} />
          <Box variant='small' display='block' color='text-body-secondary'>
            {[ENGINE_LABEL, formatDate(broker.Created)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(brokers),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create broker", primary: true, href: mqRoutes.createBroker },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        trackBy={ID_FIELD}
        items={items}
        loading={brokers.isLoading}
        loadingText='Loading brokers'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            variant='awsui-h1-sticky'
            counter={brokers.data ? `(${brokers.data.length})` : undefined}
            description={`RabbitMQ brokers. Region: ${region}.`}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Brokers
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find brokers by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteBrokersModal
          brokers={selected.map((broker) => ({ id: broker.BrokerId!, name: broker.BrokerName! }))}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
