import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Link from "@cloudscape-design/components/link";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { VerificationStatus, type IdentityInfo } from "@aws-sdk/client-sesv2";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { CodeSamples } from "@shared/components/CodeSamples.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { AddEmailModal } from "../components/AddEmailModal.tsx";
import { DeleteIdentitiesModal } from "../components/DeleteIdentitiesModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { identitySample, senderOf } from "../codeSamples.ts";
import { IDENTITY_TYPE_LABELS, VERIFICATION_STATUS } from "../constants.ts";
import { SetConfigurationSetModal } from "../components/SetConfigurationSetModal.tsx";
import { useIdentities, useIdentityConfigurationSets } from "../hooks/useIdentities.ts";
import { sesBaseCrumbs, sesRoutes } from "../routes.ts";

const NAME_FIELD = "IdentityName";

const UNVERIFIED_WARNING =
  "This identity isn't verified, so SES rejects mail from it. " +
  "Send from an email identity instead: Floci verifies those right away.";

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
  const { region } = useLoadedConfig();
  useBreadcrumbs(crumbs);
  const { ref, compact } = useIsCompact();
  const identities = useIdentities();
  const defaults = useIdentityConfigurationSets();
  const configurationSetLink = useFollow();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingSet, setSettingSet] = useState(false);

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
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    },
  );

  const selected = collectionProps.selectedItems ?? [];
  const [openName, setOpenName] = useState<string>();

  const nameButton = (identity: IdentityInfo) => (
    <Button variant='inline-link' onClick={() => setOpenName(identity.IdentityName)}>
      {identity.IdentityName ?? NOT_AVAILABLE}
    </Button>
  );

  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };

  // Panel mở khi bấm tên, không theo ô chọn: panel làm trang hẹp, nút Delete bị gom vào menu
  // Domain trên Floci luôn chờ xác minh (như AWS cần DNS) nên SES từ chối gửi từ nó
  const chosen = identities.data?.find((identity) => identity.IdentityName === openName);
  const sender = chosen?.IdentityName;
  const verified = chosen?.VerificationStatus === VerificationStatus.SUCCESS;

  useSplitPanel(
    sender
      ? {
          header: sender,
          description: `Send from ${senderOf(sender)}`,
          onClose: () => setOpenName(undefined),
          body: (
            <SpaceBetween size='m'>
              {!verified && <Alert type='warning'>{UNVERIFIED_WARNING}</Alert>}
              <CodeSamples sample={identitySample(sender)} />
            </SpaceBetween>
          ),
        }
      : null,
  );

  const nameColumn: TableProps.ColumnDefinition<IdentityInfo> = {
    id: "identity",
    header: "Identity",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameButton,
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

  // Khung hẹp không có cột riêng: configuration set nằm ở dòng phụ, sau loại identity
  const configurationSetText = (identity: IdentityInfo) =>
    `Set: ${defaults.get(identity.IdentityName ?? "") || NOT_AVAILABLE}`;

  const setColumn: TableProps.ColumnDefinition<IdentityInfo> = {
    id: "configurationSet",
    header: "Configuration set",
    cell: (identity) => {
      const set = defaults.get(identity.IdentityName ?? "");

      return set ? (
        <Link href={sesRoutes.configurationSetPage(set)} onFollow={configurationSetLink}>
          {set}
        </Link>
      ) : (
        NOT_AVAILABLE
      );
    },
  };

  // Khung hẹp: tầng 1 là identity + status; tầng 2 là type, xám
  const compactColumns: TableProps.ColumnDefinition<IdentityInfo>[] = [
    {
      ...nameColumn,
      cell: (identity) => (
        <div>
          {nameButton(identity)} <StatusCell identity={identity} />
          <Box variant='small' display='block' color='text-body-secondary'>
            {[typeLabel(identity), configurationSetText(identity)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(identities),
    {
      id: "set-configuration-set",
      text: "Set configuration set",
      disabled: selected.length !== 1,
      onClick: () => setSettingSet(true),
    },
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    { id: "add", text: "Add email", primary: true, onClick: () => setAdding(true) },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={identities.data ? `(${identities.data.length})` : undefined}
      description={`Addresses your app can send from. Floci verifies an email as soon as you add it. Region: ${region}.`}
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
        columnDefinitions={
          compact ? compactColumns : [nameColumn, typeColumn, statusColumn, setColumn]
        }
        wrapLines={compact}
        header={header}
        pagination={<Pagination {...paginationProps} />}
      />
      {adding && <AddEmailModal onDismiss={() => setAdding(false)} />}
      {settingSet && selected[0]?.IdentityName && (
        <SetConfigurationSetModal
          identity={selected[0].IdentityName}
          current={defaults.get(selected[0].IdentityName)}
          onDismiss={() => setSettingSet(false)}
        />
      )}
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
