import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";
import type { AdminGetUserCommandOutput } from "@aws-sdk/client-cognito-identity-provider";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Toggle from "@cloudscape-design/components/toggle";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { emptyOrError } from "@shared/components/TableStates.tsx";
import { notifyBulkOutcome, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { AddMembersModal } from "../components/AddMembersModal.tsx";
import { AttributeModal } from "../components/AttributeModal.tsx";
import { SetPasswordModal } from "../components/SetPasswordModal.tsx";
import { UserActionModal } from "../components/UserActionModal.tsx";
import { EnabledStatus, UserStatus } from "../components/UsersTab.tsx";
import {
  EMAIL_ATTRIBUTE,
  EMAIL_VERIFIED_ATTRIBUTE,
  IDENTITIES_ATTRIBUTE,
  LOCKED_ATTRIBUTES,
  PHONE_ATTRIBUTE,
  SUB_ATTRIBUTE,
  UNCONFIRMED_STATUS,
  USER_STATUSES,
} from "../constants.ts";
import { isCognitoMissing } from "../hooks/useCognito.ts";
import { useGroups, useSetMembership, useUserGroups } from "../hooks/useGroups.ts";
import { useUserPool } from "../hooks/usePools.ts";
import {
  useDeleteUserAttribute,
  useUpdateUserAttributes,
  useUser,
  type UserAction,
} from "../hooks/useUsers.ts";
import { cognitoRoutes, mailboxHref, poolCrumbs, smsHref } from "../routes.ts";
import { attributeValue } from "../users.ts";

const MODALS = {
  setPassword: "setPassword",
  add: "add",
  edit: "edit",
  deleteAttribute: "deleteAttribute",
} as const;

type ModalId = (typeof MODALS)[keyof typeof MODALS];
const IDENTITY_SEPARATOR = " · ";
const GENERAL_COLUMNS = 3;

interface AttributeRow {
  name: string;
  value: string;
  lines?: string[]; // identities: mỗi phần tử một dòng
}

const identitiesSchema = z.array(
  z.looseObject({ providerName: z.string().optional(), userId: z.string().optional() }),
);

// identities là chuỗi JSON; hỏng hoặc sai dạng thì hiện nguyên chuỗi, không bỏ mất
function identityLines(value: string): string[] {
  try {
    const identities = identitiesSchema.safeParse(JSON.parse(value)).data;

    if (identities)
      return identities.map((item) => [item.providerName, item.userId].join(IDENTITY_SEPARATOR));
  } catch {
    // JSON hỏng: rơi xuống trả nguyên chuỗi
  }

  return [value];
}

const MENU_ACTIONS: Record<string, UserAction> = {
  confirm: "confirm",
  enable: "enable",
  disable: "disable",
  resetPassword: "resetPassword",
  signOut: "signOut",
};

function UserView({ user, poolId }: { user: AdminGetUserCommandOutput; poolId: string }) {
  const navigate = useNavigate();
  const follow = useFollow();
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const pool = useUserPool(poolId);
  const username = user.Username ?? "";
  const attributes = user.UserAttributes;
  const email = attributeValue(attributes, EMAIL_ATTRIBUTE);
  const phone = attributeValue(attributes, PHONE_ATTRIBUTE);
  const label = email ?? username;
  const [modal, setModal] = useState<ModalId | null>(null);
  const [action, setAction] = useState<UserAction | null>(null);
  const [target, setTarget] = useState<AttributeRow | null>(null);
  const closeModal = () => setModal(null);
  const updateAttributes = useUpdateUserAttributes(poolId, username);
  const deleteAttribute = useDeleteUserAttribute(poolId, username);
  const userGroups = useUserGroups(poolId, username);
  const allGroups = useGroups(poolId);
  const setMembership = useSetMembership(poolId);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const memberOf = new Set((userGroups.data ?? []).map((group) => group.GroupName));

  const joinable = (allGroups.data ?? []).flatMap((group) =>
    group.GroupName && !memberOf.has(group.GroupName) ? [{ value: group.GroupName }] : [],
  );

  const removeFromGroup = (group: string) =>
    setMembership.mutate(
      { add: false, pairs: [{ username, group }] },
      notifyBulkOutcome({
        // runEach nuốt lỗi nên phải xét count: 0 nghĩa là chưa gỡ được
        success: (result) =>
          result.count
            ? `Removed ${label} from ${group}`
            : `Couldn't remove ${label} from ${group}`,
        errorHeader: `Couldn't remove from ${group}`,
      }),
    );

  const schema = pool.data?.SchemaAttributes ?? [];
  const required = new Set(schema.filter((item) => item.Required).map((item) => item.Name));
  const isLocked = (name: string) => (LOCKED_ATTRIBUTES as readonly string[]).includes(name);
  const existing = new Set((attributes ?? []).map((attribute) => attribute.Name));

  const addableNames = schema.flatMap((item) =>
    item.Name && item.Name !== SUB_ATTRIBUTE && !existing.has(item.Name) ? [item.Name] : [],
  );

  const rows: AttributeRow[] = (attributes ?? []).map((attribute) => ({
    name: attribute.Name ?? NOT_AVAILABLE,
    value: attribute.Value ?? "",
    lines:
      attribute.Name === IDENTITIES_ATTRIBUTE ? identityLines(attribute.Value ?? "") : undefined,
  }));

  const emailVerified = attributeValue(attributes, EMAIL_VERIFIED_ATTRIBUTE) === "true";

  const toggleVerified = (checked: boolean) =>
    updateAttributes.mutate(
      [{ Name: EMAIL_VERIFIED_ATTRIBUTE, Value: String(checked) }],
      notifyOutcome({
        success: `Saved attribute ${EMAIL_VERIFIED_ATTRIBUTE}`,
        errorHeader: `Couldn't save ${EMAIL_VERIFIED_ATTRIBUTE}`,
      }),
    );

  const statusLabel = (user.UserStatus && USER_STATUSES[user.UserStatus]?.label) ?? user.UserStatus;

  const description = [
    statusLabel ?? NOT_AVAILABLE,
    user.Enabled ? "Enabled" : "Disabled",
    `created ${formatDate(user.UserCreateDate)}`,
  ].join(DETAIL_SEPARATOR);

  const generalItems: KeyValuePairsProps.Item[] = [
    { label: "Username", value: <CopyButton variant='inline' text={username} label={username} /> },
    {
      label: "sub",
      value: (() => {
        const sub = attributeValue(attributes, SUB_ATTRIBUTE);
        return sub ? <CopyButton variant='inline' text={sub} label={sub} /> : NOT_AVAILABLE;
      })(),
    },
    { label: "Status", value: <UserStatus status={user.UserStatus} /> },
    { label: "Enabled", value: <EnabledStatus enabled={user.Enabled} /> },
    { label: "Created", value: formatDate(user.UserCreateDate) },
    { label: "Modified", value: formatDate(user.UserLastModifiedDate) },
    {
      label: "Email",
      value: email ? (
        <SpaceBetween size='xs' direction='horizontal'>
          <span>{email}</span>
          <Link href={mailboxHref(email)} onFollow={follow}>
            View emails
          </Link>
        </SpaceBetween>
      ) : (
        NOT_AVAILABLE
      ),
    },
    {
      label: "Phone number",
      value: phone ? (
        <SpaceBetween size='xs' direction='horizontal'>
          <span>{phone}</span>
          <Link href={smsHref(phone)} onFollow={follow}>
            View SMS
          </Link>
        </SpaceBetween>
      ) : (
        NOT_AVAILABLE
      ),
    },
    ...(email
      ? [
          {
            label: "Email verified",
            value: (
              <Toggle
                checked={emailVerified}
                disabled={updateAttributes.isPending}
                onChange={({ detail }) => toggleVerified(detail.checked)}
              >
                {emailVerified ? "Verified" : "Not verified"}
              </Toggle>
            ),
          },
        ]
      : []),
  ];

  const columns: TableProps.ColumnDefinition<AttributeRow>[] = [
    { id: "name", header: "Name", isRowHeader: true, cell: (row) => row.name },
    {
      id: "value",
      header: "Value",
      cell: (row) =>
        row.lines ? (
          <div>
            {row.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : (
          row.value || NOT_AVAILABLE
        ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => {
        const readOnly = isLocked(row.name);

        return (
          <SpaceBetween size='xs' direction='horizontal'>
            <Button
              variant='inline-link'
              disabled={readOnly}
              onClick={() => {
                setTarget(row);
                setModal(MODALS.edit);
              }}
            >
              Edit
            </Button>
            <Button
              variant='inline-link'
              disabled={readOnly || required.has(row.name)}
              onClick={() => {
                setTarget(row);
                setModal(MODALS.deleteAttribute);
              }}
            >
              Delete
            </Button>
          </SpaceBetween>
        );
      },
    },
  ];

  const barActions: BarAction[] = [
    { id: "delete", text: "Delete", onClick: () => setAction("delete") },
    {
      id: "setPassword",
      text: "Set password",
      primary: true,
      onClick: () => setModal(MODALS.setPassword),
    },
  ];

  const menuItems = [
    ...(user.UserStatus === UNCONFIRMED_STATUS ? [{ id: "confirm", text: "Confirm sign-up" }] : []),
    { id: "resetPassword", text: "Reset password" },
    user.Enabled ? { id: "disable", text: "Disable" } : { id: "enable", text: "Enable" },
    { id: "signOut", text: "Sign out everywhere" },
  ];

  return (
    <div ref={ref}>
      <ContentLayout
        header={
          <Header
            variant='h1'
            description={description}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={(id) => {
                  const next = MENU_ACTIONS[id];
                  if (next) setAction(next);
                }}
              />
            }
          >
            {label}
          </Header>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>General</Header>}>
            <KeyValuePairs columns={compact ? 1 : GENERAL_COLUMNS} items={generalItems} />
          </Container>
          <Table
            variant='container'
            items={rows}
            trackBy='name'
            columnDefinitions={columns}
            wrapLines
            header={
              <Header
                variant='h2'
                counter={`(${rows.length})`}
                actions={<Button onClick={() => setModal(MODALS.add)}>Add attribute</Button>}
              >
                Attributes
              </Header>
            }
            empty={<Box textAlign='center'>No attributes</Box>}
          />
          <Table
            variant='container'
            items={userGroups.data ?? []}
            trackBy='GroupName'
            loading={userGroups.isLoading}
            loadingText='Loading groups'
            columnDefinitions={[
              {
                id: "name",
                header: "Group",
                isRowHeader: true,
                cell: (group) => (
                  <Link href={cognitoRoutes.group(poolId, group.GroupName ?? "")} onFollow={follow}>
                    {group.GroupName}
                  </Link>
                ),
              },
              {
                id: "description",
                header: "Description",
                cell: (group) => group.Description || NOT_AVAILABLE,
              },
              {
                id: "actions",
                header: "Actions",
                cell: (group) => (
                  <Button
                    variant='inline-link'
                    disabled={setMembership.isPending}
                    onClick={() => removeFromGroup(group.GroupName ?? "")}
                  >
                    Remove
                  </Button>
                ),
              },
            ]}
            wrapLines
            header={
              <Header
                variant='h2'
                counter={userGroups.data ? `(${userGroups.data.length})` : undefined}
                actions={
                  <Button
                    disabled={!allGroups.data || !userGroups.data}
                    onClick={() => setAddingToGroup(true)}
                  >
                    Add to group
                  </Button>
                }
              >
                Groups
              </Header>
            }
            empty={emptyOrError(userGroups, <Box textAlign='center'>No groups</Box>)}
          />
        </SpaceBetween>
      </ContentLayout>
      {addingToGroup && (
        <AddMembersModal
          poolId={poolId}
          header='Add to group'
          label='Groups'
          noun='group'
          options={joinable}
          toPairs={(groups) => groups.map((group) => ({ username, group }))}
          onDismiss={() => setAddingToGroup(false)}
        />
      )}
      {modal === MODALS.setPassword && (
        <SetPasswordModal
          poolId={poolId}
          username={username}
          label={label}
          onDismiss={closeModal}
        />
      )}
      {modal === MODALS.add && (
        <AttributeModal
          poolId={poolId}
          username={username}
          addableNames={addableNames}
          onDismiss={closeModal}
        />
      )}
      {modal === MODALS.edit && target && (
        <AttributeModal
          poolId={poolId}
          username={username}
          editing={{ name: target.name, value: target.value }}
          addableNames={addableNames}
          onDismiss={closeModal}
        />
      )}
      {modal === MODALS.deleteAttribute && target && (
        <ConfirmModal
          visible
          header='Delete attribute'
          actionText='Delete'
          loading={deleteAttribute.isPending}
          onDismiss={closeModal}
          onConfirm={() =>
            deleteAttribute.mutate(
              target.name,
              notifyOutcome({
                success: `Deleted attribute ${target.name}`,
                errorHeader: `Couldn't delete ${target.name}`,
                then: closeModal,
              }),
            )
          }
        >
          Delete {target.name} from {label}?
        </ConfirmModal>
      )}
      {action && (
        <UserActionModal
          poolId={poolId}
          action={action}
          usernames={[username]}
          labelOf={() => label}
          onDismiss={() => setAction(null)}
          onDone={() =>
            action === "delete" ? navigate(cognitoRoutes.pool(poolId)) : setAction(null)
          }
        />
      )}
    </div>
  );
}

export function UserDetail() {
  const { poolId = "", username = "" } = useParams();
  const user = useUser(poolId, username);
  const pool = useUserPool(poolId);

  useBreadcrumbs([
    ...poolCrumbs(poolId, pool.data?.Name ?? poolId),
    { text: username, href: cognitoRoutes.user(poolId, username) },
  ]);

  const state = pageState(user, {
    ready: Boolean(user.data),
    notFound: user.isError && isCognitoMissing(user.error),
    title: `User ${username} not found`,
    backHref: cognitoRoutes.pool(poolId),
    backText: "View users",
  });

  if (state || !user.data) return state;

  return <UserView user={user.data} poolId={poolId} />;
}
