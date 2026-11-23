import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { GroupType } from "@aws-sdk/client-cognito-identity-provider";
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
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useDeleteGroups, useGroups } from "../hooks/useGroups.ts";
import { cognitoRoutes } from "../routes.ts";
import { CreateGroupModal } from "./CreateGroupModal.tsx";

const NAME_FIELD = "GroupName";
const PAGE_SIZE = 50;

export function GroupsTab({ poolId }: { poolId: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const groups = useGroups(poolId);
  const deleteGroups = useDeleteGroups(poolId);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<GroupType>(groups.data ?? [], {
      filtering: {
        empty: emptyOrError(
          groups,
          <EmptyState
            title='No groups'
            description='Create a group to put users in the cognito:groups claim.'
            action={<Button onClick={() => setCreating(true)}>Create group</Button>}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        filteringFunction: (group, text) =>
          [group.GroupName, group.Description].some((value) =>
            value?.toLowerCase().includes(text.toLowerCase()),
          ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const selectedNames = selected.flatMap((group) => (group.GroupName ? [group.GroupName] : []));

  const nameLink = (group: GroupType) =>
    group.GroupName ? (
      <Link href={cognitoRoutes.group(poolId, group.GroupName)} onFollow={follow}>
        {group.GroupName}
      </Link>
    ) : (
      NOT_AVAILABLE
    );
  const precedence = (group: GroupType) => (
    <Figure>{group.Precedence?.toLocaleString() ?? NOT_AVAILABLE}</Figure>
  );
  const wideColumns: TableProps.ColumnDefinition<GroupType>[] = [
    { id: "name", header: "Name", sortingField: NAME_FIELD, isRowHeader: true, cell: nameLink },
    {
      id: "description",
      header: "Description",
      cell: (group) => group.Description || NOT_AVAILABLE,
    },
    {
      id: "precedence",
      header: <FigureHeader>Precedence</FigureHeader>,
      sortingField: "Precedence",
      cell: precedence,
    },
  ];
  // Khung hẹp: tầng 1 tên + precedence, tầng 2 mô tả
  const compactColumns: TableProps.ColumnDefinition<GroupType>[] = [
    {
      ...wideColumns[0],
      cell: (group) => (
        <SpaceBetween size='xxs'>
          <SpaceBetween size='xs' direction='horizontal'>
            {nameLink(group)}
            {precedence(group)}
          </SpaceBetween>
          <Box variant='small' color='text-body-secondary'>
            {group.Description || NOT_AVAILABLE}
          </Box>
        </SpaceBetween>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(groups),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "create", text: "Create group", primary: true, onClick: () => setCreating(true) },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<GroupType>("group", (group) => group.GroupName ?? "")}
        trackBy={NAME_FIELD}
        items={items}
        loading={groups.isLoading}
        loadingText='Loading groups'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            variant='h2'
            counter={groups.data ? `(${groups.data.length})` : undefined}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Groups
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find by name or description'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {creating && <CreateGroupModal poolId={poolId} onDismiss={() => setCreating(false)} />}
      {deleting && (
        <ConfirmModal
          visible
          header={`Delete ${pluralize(selectedNames.length, "group")}?`}
          confirmText={CONFIRM_DELETE}
          actionText='Delete'
          loading={deleteGroups.isPending}
          onDismiss={() => setDeleting(false)}
          onConfirm={() =>
            deleteGroups.mutate(
              selectedNames,
              notifyBulkOutcome({
                success: (result) => `Deleted ${pluralize(result.count, "group")}`,
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
        </ConfirmModal>
      )}
    </div>
  );
}
