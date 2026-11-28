import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { SubscriptionFilter } from "@aws-sdk/client-cloudwatch-logs";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { kinesisRoutes } from "../../kinesis/routes.ts";
import { lambdaRoutes } from "../../lambda/routes.ts";
import {
  useDeleteSubscriptionFilters,
  useSubscriptionFilters,
} from "../hooks/useSubscriptionFilters.ts";
import { destinationOf } from "../sources.ts";
import { CreateSubscriptionFilterModal } from "./CreateSubscriptionFilterModal.tsx";

const ID_FIELD = "filterName";
const DESTINATION_LABELS = { lambda: "Lambda", kinesis: "Kinesis" } as const;
const DESTINATION_HREFS = { lambda: lambdaRoutes.function, kinesis: kinesisRoutes.stream };

const nameOf = (filter: SubscriptionFilter) => filter.filterName ?? "";

export function SubscriptionFiltersTab({ group }: { group: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const filters = useSubscriptionFilters(group);
  const deleteFilters = useDeleteSubscriptionFilters(group);
  const [modal, setModal] = useState<"create" | "delete">();
  const { items, collectionProps, actions } = useCollection(filters.data ?? [], {
    selection: { trackBy: ID_FIELD },
  });
  const selected = collectionProps.selectedItems ?? [];

  const destinationCell = (filter: SubscriptionFilter) => {
    const destination = destinationOf(filter.destinationArn ?? "");
    if (destination.kind === "other") return destination.name;
    return (
      <>
        {DESTINATION_LABELS[destination.kind]} ›{" "}
        <Link href={DESTINATION_HREFS[destination.kind](destination.name)} onFollow={follow}>
          {destination.name}
        </Link>
      </>
    );
  };

  const columns: TableProps.ColumnDefinition<SubscriptionFilter>[] = [
    { id: "name", header: "Name", isRowHeader: true, cell: nameOf },
    { id: "pattern", header: "Filter pattern", cell: (filter) => filter.filterPattern },
    { id: "destination", header: "Destination", cell: destinationCell },
  ];

  const barActions: BarAction[] = [
    refreshAction(filters),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setModal("delete"),
    },
    { id: "create", text: "Create", primary: true, onClick: () => setModal("create") },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<SubscriptionFilter>("subscription filter", nameOf)}
        trackBy={ID_FIELD}
        items={items}
        loading={filters.isLoading}
        loadingText='Loading subscription filters'
        columnDefinitions={columns}
        wrapLines
        empty={emptyOrError(
          filters,
          <EmptyState
            title='No subscription filters'
            description='Send matching events to a Lambda function or a Kinesis stream.'
          />,
        )}
        header={
          <Header
            counter={filters.data ? `(${filters.data.length})` : undefined}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Subscription filters
          </Header>
        }
      />
      {modal === "create" && (
        <CreateSubscriptionFilterModal group={group} onDismiss={() => setModal(undefined)} />
      )}
      {modal === "delete" && (
        <BulkActionModal
          mutation={deleteFilters}
          items={selected.map(nameOf)}
          lines={selected.map(nameOf)}
          noun='subscription filter'
          onDismiss={() => setModal(undefined)}
          onDone={() => {
            setModal(undefined);
            actions.setSelectedItems([]);
          }}
        />
      )}
    </div>
  );
}
