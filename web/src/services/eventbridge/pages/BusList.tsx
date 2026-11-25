import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import type { Bus } from "../buses.ts";
import { DEFAULT_BUS_NAME } from "../constants.ts";
import { CreateBusModal } from "../components/CreateBusModal.tsx";
import { DeleteBusesModal } from "../components/DeleteBusesModal.tsx";
import { SendEventsModal } from "../components/SendEventsModal.tsx";
import { useBuses } from "../hooks/useBuses.ts";
import { busesCrumbs, eventbridgeRoutes } from "../routes.ts";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";

const NAME_FIELD = "name";

type Modal = "create" | "delete" | "send" | null;

export function BusList() {
  useBreadcrumbs(busesCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const buses = useBuses();
  const [modal, setModal] = useState<Modal>(null);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Bus>(buses.data ?? [], {
      filtering: {
        empty: emptyOrError(buses, <EmptyState title='No event buses' />),
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
    setModal(null);
    actions.setSelectedItems([]);
  };

  const nameLink = (bus: Bus) => (
    <Link href={eventbridgeRoutes.rules(bus.name)} onFollow={follow}>
      {bus.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<Bus> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: (bus) => nameLink(bus),
  };
  const arnColumn: TableProps.ColumnDefinition<Bus> = {
    id: "arn",
    header: "ARN",
    cell: (bus) => <CopyButton variant='inline' text={bus.arn} label={bus.arn} />,
  };
  // Khung hẹp: ARN là dòng xám dưới tên
  const compactColumns: TableProps.ColumnDefinition<Bus>[] = [
    {
      ...nameColumn,
      cell: (bus) => (
        <div>
          {nameLink(bus)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {bus.arn}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(buses),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setModal("delete"),
    },
    { id: "send", text: "Send events", onClick: () => setModal("send") },
    { id: "create", text: "Create event bus", primary: true, onClick: () => setModal("create") },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={buses.data ? `(${buses.data.length})` : undefined}
      description={`Buses receive events and route them to rules. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Event buses
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<Bus>("event bus", (bus) => bus.name)}
        trackBy={NAME_FIELD}
        // Bus default không xóa được
        isItemDisabled={(bus) => bus.name === DEFAULT_BUS_NAME}
        items={items}
        loading={buses.isLoading}
        loadingText='Loading event buses'
        columnDefinitions={compact ? compactColumns : [nameColumn, arnColumn]}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find event buses by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {modal === "create" && <CreateBusModal onDismiss={() => setModal(null)} />}
      {modal === "send" && <SendEventsModal onDismiss={() => setModal(null)} />}
      {modal === "delete" && (
        <DeleteBusesModal buses={selected} onDismiss={() => setModal(null)} onDone={finishDelete} />
      )}
    </div>
  );
}
