import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { UserPoolType, UserType } from "@aws-sdk/client-cognito-identity-provider";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { ANY_STATUS, EMAIL_ATTRIBUTE, UNCONFIRMED_STATUS, USER_STATUSES } from "../constants.ts";
import { useUsers, type UserAction } from "../hooks/useUsers.ts";
import { cognitoRoutes } from "../routes.ts";
import { attributeValue, truncateMiddle } from "../users.ts";
import { CreateUserModal } from "./CreateUserModal.tsx";
import { UserActionModal } from "./UserActionModal.tsx";

const USERNAME_FIELD = "Username";

const STATUS_OPTIONS = [
  { value: ANY_STATUS, label: "Any status" },
  ...Object.entries(USER_STATUSES).map(([value, { label }]) => ({ value, label })),
];

const emailOf = (user: UserType) => attributeValue(user.Attributes, EMAIL_ATTRIBUTE);

export const UserStatus = ({ status }: { status?: string }) => {
  const known = status ? USER_STATUSES[status] : undefined;

  return (
    <StatusIndicator type={known?.type ?? "info"}>
      {known?.label ?? status ?? NOT_AVAILABLE}
    </StatusIndicator>
  );
};

export const EnabledStatus = ({ enabled }: { enabled?: boolean }) => (
  <StatusIndicator type={enabled ? "success" : "stopped"}>
    {enabled ? "Enabled" : "Disabled"}
  </StatusIndicator>
);

export function UsersTab({ pool, poolId }: { pool: UserPoolType; poolId: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const users = useUsers(poolId);
  const [status, setStatus] = useState(ANY_STATUS);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<UserAction | null>(null);
  const signInWithEmail = Boolean(pool.UsernameAttributes?.includes(EMAIL_ATTRIBUTE));

  const emptyState = emptyOrError(
    users,
    <EmptyState
      title='No users'
      description='Create a user to test sign-in.'
      action={<Button onClick={() => setCreating(true)}>Create user</Button>}
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<UserType>(users.data ?? [], {
      filtering: {
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={
              <Button
                onClick={() => {
                  actions.setFiltering("");
                  setStatus(ANY_STATUS);
                }}
              >
                Clear filter
              </Button>
            }
          />
        ),
        // Lọc status ở đây (không lọc trước): danh sách gốc còn dòng thì Cloudscape mới hiện noMatch thay vì empty
        filteringFunction: (user, text) => {
          const needle = text.toLowerCase();

          return (
            (status === ANY_STATUS || user.UserStatus === status) &&
            [user.Username, emailOf(user)].some((value) => value?.toLowerCase().includes(needle))
          );
        },
      },
      sorting: { defaultState: { sortingColumn: { sortingField: USERNAME_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: USERNAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const selectedNames = selected.flatMap((user) => (user.Username ? [user.Username] : []));
  const canConfirm =
    selected.length > 0 && selected.every((user) => user.UserStatus === UNCONFIRMED_STATUS);
  const labelOf = (username: string) =>
    emailOf(selected.find((user) => user.Username === username) ?? {}) ?? username;

  const usernameLink = (user: UserType) => {
    const username = user.Username ?? NOT_AVAILABLE;

    return user.Username ? (
      <Link href={cognitoRoutes.user(poolId, user.Username)} onFollow={follow}>
        <span title={username}>{truncateMiddle(username)}</span>
      </Link>
    ) : (
      username
    );
  };

  const usernameColumn: TableProps.ColumnDefinition<UserType> = {
    id: "username",
    header: "Username",
    sortingField: USERNAME_FIELD,
    isRowHeader: true,
    cell: usernameLink,
  };

  const wideColumns: TableProps.ColumnDefinition<UserType>[] = [
    usernameColumn,
    { id: "email", header: "Email", cell: (user) => emailOf(user) ?? NOT_AVAILABLE },
    { id: "status", header: "Status", cell: (user) => <UserStatus status={user.UserStatus} /> },
    { id: "enabled", header: "Enabled", cell: (user) => <EnabledStatus enabled={user.Enabled} /> },
  ];

  // Khung hẹp: tầng 1 username + status, tầng 2 email + enabled
  const compactColumns: TableProps.ColumnDefinition<UserType>[] = [
    {
      ...usernameColumn,
      cell: (user) => (
        <SpaceBetween size='xxs'>
          <SpaceBetween size='xs' direction='horizontal'>
            {usernameLink(user)}
            <UserStatus status={user.UserStatus} />
          </SpaceBetween>
          <SpaceBetween size='xs' direction='horizontal'>
            <Box variant='small' color='text-body-secondary'>
              {emailOf(user) ?? NOT_AVAILABLE}
            </Box>
            <EnabledStatus enabled={user.Enabled} />
          </SpaceBetween>
        </SpaceBetween>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(users),
    { id: "create", text: "Create user", primary: true, onClick: () => setCreating(true) },
  ];

  const menuItems = [
    { id: "confirm", text: "Confirm", disabled: !canConfirm },
    { id: "enable", text: "Enable", disabled: !selected.length },
    { id: "disable", text: "Disable", disabled: !selected.length },
    { id: "delete", text: "Delete", disabled: !selected.length },
  ];

  const finish = () => {
    setAction(null);
    actions.setSelectedItems([]);
  };

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<UserType>("user", (user) => user.Username ?? "")}
        trackBy={USERNAME_FIELD}
        items={items}
        loading={users.isLoading}
        loadingText='Loading users'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            variant='h2'
            counter={users.data ? `(${users.data.length})` : undefined}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={(id) => setAction(id as UserAction)}
              />
            }
          >
            Users
          </Header>
        }
        filter={
          <SpaceBetween size='xs' direction={compact ? "vertical" : "horizontal"}>
            <TextFilter
              {...filterProps}
              filteringPlaceholder='Find by username or email'
              countText={`${filteredItemsCount ?? 0} matches`}
            />
            <Select
              ariaLabel='Status'
              options={STATUS_OPTIONS}
              selectedOption={STATUS_OPTIONS.find((option) => option.value === status) ?? null}
              onChange={({ detail }) => setStatus(detail.selectedOption.value ?? ANY_STATUS)}
            />
          </SpaceBetween>
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {creating && (
        <CreateUserModal
          poolId={poolId}
          signInWithEmail={signInWithEmail}
          onDismiss={() => setCreating(false)}
        />
      )}
      {action && (
        <UserActionModal
          poolId={poolId}
          action={action}
          usernames={selectedNames}
          labelOf={labelOf}
          onDismiss={() => setAction(null)}
          onDone={finish}
        />
      )}
    </div>
  );
}
