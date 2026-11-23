import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { UserPoolClientType } from "@aws-sdk/client-cognito-identity-provider";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useClients, useDeleteClients } from "../hooks/useClients.ts";
import { cognitoRoutes } from "../routes.ts";
import { truncateMiddle } from "../users.ts";

const NAME_FIELD = "ClientName";
const ID_FIELD = "ClientId";
const PAGE_SIZE = 50;

export function ClientsTab({ poolId }: { poolId: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const clients = useClients(poolId);
  const deleteClients = useDeleteClients(poolId);
  const [deleting, setDeleting] = useState(false);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<UserPoolClientType>(clients.data ?? [], {
      filtering: {
        empty: emptyOrError(
          clients,
          <EmptyState
            title='No app clients'
            description='Create an app client so your app can sign users in.'
            action={
              <Button href={cognitoRoutes.createClient(poolId)} onFollow={follow}>
                Create app client
              </Button>
            }
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        filteringFunction: (client, text) =>
          [client.ClientName, client.ClientId].some((value) =>
            value?.toLowerCase().includes(text.toLowerCase()),
          ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const selectedIds = selected.flatMap((client) => (client.ClientId ? [client.ClientId] : []));

  const nameLink = (client: UserPoolClientType) =>
    client.ClientId ? (
      <Link href={cognitoRoutes.client(poolId, client.ClientId)} onFollow={follow}>
        {client.ClientName ?? client.ClientId}
      </Link>
    ) : (
      NOT_AVAILABLE
    );
  const clientId = (client: UserPoolClientType) =>
    client.ClientId ? <span title={client.ClientId}>{truncateMiddle(client.ClientId)}</span> : NOT_AVAILABLE;
  const secret = (client: UserPoolClientType) => (client.ClientSecret ? "Yes" : NOT_AVAILABLE);

  const wideColumns: TableProps.ColumnDefinition<UserPoolClientType>[] = [
    { id: "name", header: "Name", sortingField: NAME_FIELD, isRowHeader: true, cell: nameLink },
    { id: "clientId", header: "Client ID", cell: clientId },
    { id: "secret", header: "Secret", cell: secret },
  ];
  // Khung hẹp: tên ở tầng 1, ID và secret ở tầng 2
  const compactColumns: TableProps.ColumnDefinition<UserPoolClientType>[] = [
    {
      ...wideColumns[0],
      cell: (client) => (
        <SpaceBetween size='xxs'>
          {nameLink(client)}
          <Box variant='small' color='text-body-secondary'>
            {clientId(client)} · Secret: {secret(client)}
          </Box>
        </SpaceBetween>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(clients),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    {
      id: "create",
      text: "Create app client",
      primary: true,
      href: cognitoRoutes.createClient(poolId),
    },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<UserPoolClientType>("app client", (client) => client.ClientName ?? "")}
        trackBy={ID_FIELD}
        items={items}
        loading={clients.isLoading}
        loadingText='Loading app clients'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            variant='h2'
            counter={clients.data ? `(${clients.data.length})` : undefined}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            App clients
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find by name or client ID'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <ConfirmModal
          visible
          header={`Delete ${pluralize(selectedIds.length, "app client")}?`}
          confirmText={CONFIRM_DELETE}
          actionText='Delete'
          loading={deleteClients.isPending}
          onDismiss={() => setDeleting(false)}
          onConfirm={() =>
            deleteClients.mutate(
              selectedIds,
              notifyBulkOutcome({
                success: (result) => `Deleted ${pluralize(result.count, "app client")}`,
                errorHeader: "Couldn't delete",
                then: () => {
                  setDeleting(false);
                  actions.setSelectedItems([]);
                },
              }),
            )
          }
        >
          <DeletePreview lines={selected.map((client) => client.ClientName ?? client.ClientId)} />
        </ConfirmModal>
      )}
    </div>
  );
}
