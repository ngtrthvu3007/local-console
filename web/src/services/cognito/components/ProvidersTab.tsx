import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { ProviderDescription, UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate, pluralize } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useDeleteProviders, useProviders } from "../hooks/useProviders.ts";
import { cognitoRoutes } from "../routes.ts";
import { DomainBlock } from "./DomainBlock.tsx";

const NAME_FIELD = "ProviderName";

export function ProvidersTab({ pool, poolId }: { pool: UserPoolType; poolId: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const providers = useProviders(poolId);
  const deleteProviders = useDeleteProviders(poolId);
  const [deleting, setDeleting] = useState(false);

  const { items, collectionProps, actions } = useCollection<ProviderDescription>(providers.data ?? [], {
    filtering: {
      empty: emptyOrError(
        providers,
        <EmptyState
          title='No identity providers'
          description='Add an OIDC or Google provider to test federated sign-in.'
          action={
            <Button href={cognitoRoutes.createProvider(poolId)} onFollow={follow}>
              Create identity provider
            </Button>
          }
        />,
      ),
    },
    sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
    selection: { trackBy: NAME_FIELD },
  });

  const selected = collectionProps.selectedItems ?? [];
  const selectedNames = selected.flatMap((provider) => (provider.ProviderName ? [provider.ProviderName] : []));

  const nameLink = (provider: ProviderDescription) =>
    provider.ProviderName ? (
      <Link href={cognitoRoutes.editProvider(poolId, provider.ProviderName)} onFollow={follow}>
        {provider.ProviderName}
      </Link>
    ) : (
      NOT_AVAILABLE
    );

  const wideColumns: TableProps.ColumnDefinition<ProviderDescription>[] = [
    { id: "name", header: "Name", sortingField: NAME_FIELD, isRowHeader: true, cell: nameLink },
    { id: "type", header: "Type", cell: (provider) => provider.ProviderType ?? NOT_AVAILABLE },
    { id: "created", header: "Created", cell: (provider) => formatDate(provider.CreationDate) },
  ];
  // Khung hẹp: tên ở tầng 1, loại và ngày tạo ở tầng 2
  const compactColumns: TableProps.ColumnDefinition<ProviderDescription>[] = [
    {
      ...wideColumns[0],
      cell: (provider) => (
        <SpaceBetween size='xxs'>
          {nameLink(provider)}
          <Box variant='small' color='text-body-secondary'>
            {provider.ProviderType ?? NOT_AVAILABLE} · {formatDate(provider.CreationDate)}
          </Box>
        </SpaceBetween>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(providers),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    {
      id: "create",
      text: "Create identity provider",
      primary: true,
      href: cognitoRoutes.createProvider(poolId),
    },
  ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <DomainBlock pool={pool} poolId={poolId} />
        <Table
          {...collectionProps}
          selectionType='multi'
          ariaLabels={selectionLabels<ProviderDescription>("identity provider", (provider) => provider.ProviderName ?? "")}
          trackBy={NAME_FIELD}
          items={items}
          loading={providers.isLoading}
          loadingText='Loading identity providers'
          columnDefinitions={compact ? compactColumns : wideColumns}
          wrapLines={compact}
          header={
            <Header
              variant='h2'
              counter={providers.data ? `(${providers.data.length})` : undefined}
              actions={<ActionBar compact={compact} actions={barActions} />}
            >
              Identity providers
            </Header>
          }
        />
      </SpaceBetween>
      {deleting && (
        <ConfirmModal
          visible
          header={`Delete ${pluralize(selectedNames.length, "identity provider")}?`}
          confirmText={CONFIRM_DELETE}
          actionText='Delete'
          loading={deleteProviders.isPending}
          onDismiss={() => setDeleting(false)}
          onConfirm={() =>
            deleteProviders.mutate(
              selectedNames,
              notifyBulkOutcome({
                success: (result) => `Deleted ${pluralize(result.count, "identity provider")}`,
                errorHeader: "Couldn't delete",
                then: () => {
                  setDeleting(false);
                  actions.setSelectedItems([]);
                },
              }),
            )
          }
        >
          <DeletePreview lines={selectedNames} />
          <Alert type='warning'>Floci keeps these names in app clients. Remove them on each client's Edit page.</Alert>
        </ConfirmModal>
      )}
    </div>
  );
}
