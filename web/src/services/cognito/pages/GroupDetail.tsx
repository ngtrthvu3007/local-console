import { useState } from "react";
import { useParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { GroupType, UserType } from "@aws-sdk/client-cognito-identity-provider";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { AddMembersModal } from "../components/AddMembersModal.tsx";
import { EnabledStatus, UserStatus } from "../components/UsersTab.tsx";
import { EMAIL_ATTRIBUTE, GROUP_GENERAL_COLUMNS, GROUP_MEMBERS_DESCRIPTION } from "../constants.ts";
import { isCognitoMissing } from "../hooks/useCognito.ts";
import { useGroup, useGroupMembers, useSetMembership } from "../hooks/useGroups.ts";
import { useUserPool } from "../hooks/usePools.ts";
import { useUsers } from "../hooks/useUsers.ts";
import { POOL_TABS, cognitoRoutes, poolCrumbs } from "../routes.ts";
import { attributeValue, truncateMiddle } from "../users.ts";

const USERNAME_FIELD = "Username";

function GroupView({ group, poolId }: { group: GroupType; poolId: string }) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const name = group.GroupName ?? "";
  const members = useGroupMembers(poolId, name);
  const allUsers = useUsers(poolId);
  const setMembership = useSetMembership(poolId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  const { items, collectionProps, filterProps, filteredItemsCount, actions } =
    useCollection<UserType>(members.data ?? [], {
      filtering: {
        empty: emptyOrError(members, <EmptyState title='No users' />),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        filteringFunction: (user, text) =>
          [user.Username, attributeValue(user.Attributes, EMAIL_ATTRIBUTE)].some((value) =>
            value?.toLowerCase().includes(text.toLowerCase()),
          ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: USERNAME_FIELD } } },
      selection: { trackBy: USERNAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];
  const selectedNames = selected.flatMap((user) => (user.Username ? [user.Username] : []));
  const memberNames = new Set((members.data ?? []).map((user) => user.Username));
  // Pool đăng nhập bằng email có Username là UUID: hiện email làm nhãn, giữ Username làm giá trị gửi API
  const options = (allUsers.data ?? []).flatMap((user) => {
    if (!user.Username || memberNames.has(user.Username)) return [];
    const email = attributeValue(user.Attributes, EMAIL_ATTRIBUTE);
    return [{ value: user.Username, label: email ?? user.Username, description: email ? user.Username : undefined }];
  });

  const columns: TableProps.ColumnDefinition<UserType>[] = [
    {
      id: "username",
      header: "Username",
      sortingField: USERNAME_FIELD,
      isRowHeader: true,
      cell: (user) =>
        user.Username ? (
          <Link href={cognitoRoutes.user(poolId, user.Username)} onFollow={follow}>
            <span title={user.Username}>{truncateMiddle(user.Username)}</span>
          </Link>
        ) : (
          NOT_AVAILABLE
        ),
    },
    {
      id: "email",
      header: "Email",
      cell: (user) => attributeValue(user.Attributes, EMAIL_ATTRIBUTE) ?? NOT_AVAILABLE,
    },
    { id: "status", header: "Status", cell: (user) => <UserStatus status={user.UserStatus} /> },
    { id: "enabled", header: "Enabled", cell: (user) => <EnabledStatus enabled={user.Enabled} /> },
  ];

  const remove = () =>
    setMembership.mutate(
      { add: false, pairs: selectedNames.map((username) => ({ username, group: name })) },
      notifyBulkOutcome({
        success: (result) => `Removed ${pluralize(result.count, "user")}`,
        errorHeader: "Couldn't remove",
        then: () => {
          setRemoving(false);
          actions.setSelectedItems([]);
        },
      }),
    );

  return (
    <div ref={ref}>
    <ContentLayout header={<Header variant='h1'>{name}</Header>}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>General</Header>}>
          <KeyValuePairs
            columns={compact ? 1 : GROUP_GENERAL_COLUMNS}
            items={[
              { label: "Name", value: name },
              { label: "Description", value: group.Description || NOT_AVAILABLE },
              { label: "Precedence", value: group.Precedence?.toLocaleString() ?? NOT_AVAILABLE },
            ]}
          />
        </Container>
        <Table
          {...collectionProps}
          variant='container'
          selectionType='multi'
          ariaLabels={selectionLabels<UserType>("user", (user) => user.Username ?? "")}
          trackBy={USERNAME_FIELD}
          items={items}
          loading={members.isLoading}
          loadingText='Loading users'
          columnDefinitions={columns}
          wrapLines
          header={
            <Header
              variant='h2'
              description={GROUP_MEMBERS_DESCRIPTION}
              counter={members.data ? `(${members.data.length})` : undefined}
              actions={
                <SpaceBetween size='xs' direction='horizontal'>
                  <Button disabled={!selected.length} onClick={() => setRemoving(true)}>
                    Remove
                  </Button>
                  <Button variant='primary' disabled={!allUsers.data || !members.data} onClick={() => setAdding(true)}>
                    Add users
                  </Button>
                </SpaceBetween>
              }
            >
              Users
            </Header>
          }
          filter={
            <TextFilter
              {...filterProps}
              filteringPlaceholder='Find by username or email'
              countText={`${filteredItemsCount ?? 0} matches`}
            />
          }
        />
      </SpaceBetween>
      {adding && (
        <AddMembersModal
          poolId={poolId}
          header='Add users'
          label='Users'
          noun='user'
          options={options}
          toPairs={(usernames) => usernames.map((username) => ({ username, group: name }))}
          onDismiss={() => setAdding(false)}
        />
      )}
      {removing && (
        <ConfirmModal
          visible
          header={`Remove ${pluralize(selectedNames.length, "user")}?`}
          actionText='Remove'
          loading={setMembership.isPending}
          onDismiss={() => setRemoving(false)}
          onConfirm={remove}
        >
          Remove {pluralize(selectedNames.length, "user")} from {name}?
        </ConfirmModal>
      )}
    </ContentLayout>
    </div>
  );
}

export function GroupDetail() {
  const { poolId = "", group: groupName = "" } = useParams();
  const group = useGroup(poolId, groupName);
  const pool = useUserPool(poolId);

  useBreadcrumbs([
    ...poolCrumbs(poolId, pool.data?.Name ?? poolId),
    { text: groupName, href: cognitoRoutes.group(poolId, groupName) },
  ]);

  const state = pageState(group, {
    ready: Boolean(group.data),
    notFound: group.isError && isCognitoMissing(group.error),
    title: `Group ${groupName} not found`,
    backHref: cognitoRoutes.pool(poolId, POOL_TABS.groups),
    backText: "View groups",
  });
  if (state || !group.data) return state;

  return <GroupView group={group.data} poolId={poolId} />;
}
