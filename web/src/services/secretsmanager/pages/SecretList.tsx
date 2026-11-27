import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { SecretListEntry } from "@aws-sdk/client-secrets-manager";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteSecretModal } from "../components/DeleteSecretModal.tsx";
import { useSecrets } from "../hooks/useSecrets.ts";
import { secretsRoutes } from "@localconsole/core/secretsmanager";
import { secretsBaseCrumbs } from "../routes.ts";

const NAME_FIELD = "Name";

const nameOf = (secret: SecretListEntry) => secret.Name ?? "";

export function SecretList() {
  useBreadcrumbs(secretsBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const secrets = useSecrets();
  const [deleting, setDeleting] = useState(false);

  const createButton = (
    <Button variant='primary' href={secretsRoutes.createSecret} onFollow={follow}>
      Store a new secret
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<SecretListEntry>(secrets.data ?? [], {
      filtering: {
        empty: emptyOrError(
          secrets,
          <EmptyState
            title='No secrets'
            description={`You don't have any secrets in ${region}.`}
            action={createButton}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        fields: [NAME_FIELD],
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems?.[0];

  const nameLink = (secret: SecretListEntry) => (
    <Link href={secretsRoutes.secret(nameOf(secret))} onFollow={follow}>
      {nameOf(secret)}
    </Link>
  );

  const rotation = (secret: SecretListEntry) =>
    secret.RotationEnabled ? <StatusIndicator>Enabled</StatusIndicator> : NOT_AVAILABLE;

  const nameColumn: TableProps.ColumnDefinition<SecretListEntry> = {
    id: "name",
    header: "Secret name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };

  const wideColumns: TableProps.ColumnDefinition<SecretListEntry>[] = [
    nameColumn,
    { id: "description", header: "Description", cell: (s) => s.Description || NOT_AVAILABLE },
    { id: "changed", header: "Last changed", cell: (s) => formatDate(s.LastChangedDate) },
    { id: "rotation", header: "Rotation", cell: rotation },
  ];

  // Khung hẹp: tầng 2 là mô tả và ngày đổi, màu xám
  const compactColumns: TableProps.ColumnDefinition<SecretListEntry>[] = [
    {
      ...nameColumn,
      cell: (secret) => (
        <div>
          {nameLink(secret)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[secret.Description, formatDate(secret.LastChangedDate)]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    { id: "rotation", header: "Rotation", cell: rotation },
  ];

  const barActions: BarAction[] = [
    refreshAction(secrets),
    { id: "delete", text: "Delete", disabled: !selected, onClick: () => setDeleting(true) },
    { id: "create", text: "Store a new secret", primary: true, href: secretsRoutes.createSecret },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={secrets.data ? `(${secrets.data.length})` : undefined}
      description={`Credentials and settings your apps read at run time. Region: ${region}.`}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Secrets
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<SecretListEntry>("secret", nameOf)}
        trackBy={NAME_FIELD}
        items={items}
        loading={secrets.isLoading}
        loadingText='Loading secrets'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find secrets by name'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && selected && (
        <DeleteSecretModal
          name={nameOf(selected)}
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
