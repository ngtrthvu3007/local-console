import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { IdentityInfo } from "@aws-sdk/client-sesv2";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { AddEmailModal } from "../components/AddEmailModal.tsx";
import { DeleteIdentitiesModal } from "../components/DeleteIdentitiesModal.tsx";
import { IDENTITY_TYPE_LABELS, VERIFICATION_STATUS } from "../constants.ts";
import { useIdentities } from "../hooks/useIdentities.ts";
import { sesBaseCrumbs, sesRoutes } from "../routes.ts";

const NAME_FIELD = "IdentityName";
const PAGE_SIZE = 50;
const crumbs = [...sesBaseCrumbs, { text: "Identities", href: sesRoutes.identities }];

const typeLabel = (identity: IdentityInfo) =>
  identity.IdentityType ? IDENTITY_TYPE_LABELS[identity.IdentityType] : NOT_AVAILABLE;

function StatusCell({ identity }: { identity: IdentityInfo }) {
  const status = identity.VerificationStatus && VERIFICATION_STATUS[identity.VerificationStatus];
  return status ? (
    <StatusIndicator type={status.type}>{status.label}</StatusIndicator>
  ) : (
    <>{NOT_AVAILABLE}</>
  );
}

export function Identities() {
  useBreadcrumbs(crumbs);
  const { ref, compact } = useIsCompact();
  const identities = useIdentities();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const emptyState = emptyOrError(
    identities,
    <EmptyState
      title='No identities'
      description='Add the address your app sends from.'
      action={<Button onClick={() => setAdding(true)}>Add email</Button>}
    />,
  );

  const { items, collectionProps, paginationProps, actions } = useCollection<IdentityInfo>(
    identities.data ?? [],
    {
      filtering: { empty: emptyState },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    },
  );

  const selected = collectionProps.selectedItems ?? [];
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  const nameColumn: TableProps.ColumnDefinition<IdentityInfo> = {
    id: "identity",
    header: "Identity",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: (identity) => identity.IdentityName ?? NOT_AVAILABLE,
  };
  const typeColumn: TableProps.ColumnDefinition<IdentityInfo> = {
    id: "type",
    header: "Type",
    cell: typeLabel,
  };
  const statusColumn: TableProps.ColumnDefinition<IdentityInfo> = {
    id: "status",
    header: "Status",
    cell: (identity) => <StatusCell identity={identity} />,
  };
  // Khung hẹp: tầng 1 là identity + status; tầng 2 là type, xám
  const compactColumns: TableProps.ColumnDefinition<IdentityInfo>[] = [
    {
      ...nameColumn,
      cell: (identity) => (
        <div>
          {identity.IdentityName ?? NOT_AVAILABLE} <StatusCell identity={identity} />
          <Box variant='small' display='block' color='text-body-secondary'>
            {typeLabel(identity)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(identities),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "add", text: "Add email", primary: true, onClick: () => setAdding(true) },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={identities.data ? `(${identities.data.length})` : undefined}
      description='Addresses your app can send from. Floci verifies an email as soon as you add it.'
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Identities
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<IdentityInfo>("identity", (item) => item.IdentityName ?? "")}
        trackBy={NAME_FIELD}
        items={items}
        loading={identities.isLoading}
        loadingText='Loading identities'
        columnDefinitions={compact ? compactColumns : [nameColumn, typeColumn, statusColumn]}
        wrapLines={compact}
        header={header}
        pagination={<Pagination {...paginationProps} />}
      />
      {adding && <AddEmailModal onDismiss={() => setAdding(false)} />}
      {deleting && (
        <DeleteIdentitiesModal
          identities={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
