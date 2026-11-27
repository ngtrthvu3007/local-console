import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { LogGroup } from "@aws-sdk/client-cloudwatch-logs";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, formatBytes, formatDate } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { CreateLogGroupModal } from "../components/CreateLogGroupModal.tsx";
import { DeleteLogGroupsModal } from "../components/DeleteLogGroupsModal.tsx";
import { retentionLabel, logsRoutes } from "@localconsole/core/logs";
import { useLogGroups } from "../hooks/useLogGroups.ts";
import { logsBaseCrumbs } from "../routes.ts";

const ID_FIELD = "logGroupName";

const nameOf = (group: LogGroup) => group.logGroupName ?? "";

export function LogGroupList() {
  useBreadcrumbs(logsBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const [filterText, setFilterText] = useState("");
  // Chỉ tải lại khi ngừng gõ: prefix gửi lên Floci, không lọc từng phím
  const [prefix, setPrefix] = useState("");
  const groups = useLogGroups(prefix);
  const [modal, setModal] = useState<"create" | "delete">();

  const { items, collectionProps, paginationProps, actions } = useCollection(groups.data ?? [], {
    sorting: { defaultState: { sortingColumn: { sortingField: ID_FIELD } } },
    pagination: { pageSize: TABLE_PAGE_SIZE },
    selection: { trackBy: ID_FIELD },
  });
  const selected = collectionProps.selectedItems ?? [];

  const empty = prefix ? (
    <EmptyState
      title='No matches'
      action={
        <Button
          onClick={() => {
            setFilterText("");
            setPrefix("");
          }}
        >
          Clear filter
        </Button>
      }
    />
  ) : (
    emptyOrError(
      groups,
      <EmptyState
        title='No log groups'
        description={`Services and apps haven't written logs in ${region} yet.`}
        action={<Button onClick={() => setModal("create")}>Create log group</Button>}
      />,
    )
  );

  const nameLink = (group: LogGroup) => (
    <Link href={logsRoutes.group(nameOf(group))} onFollow={follow}>
      {nameOf(group)}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<LogGroup> = {
    id: "name",
    header: "Log group",
    sortingField: ID_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const retentionText = (group: LogGroup) => retentionLabel(group.retentionInDays);

  const wideColumns: TableProps.ColumnDefinition<LogGroup>[] = [
    nameColumn,
    { id: "retention", header: "Retention", cell: retentionText },
    { id: "bytes", header: "Stored bytes", cell: (group) => formatBytes(group.storedBytes) },
    {
      id: "created",
      header: "Created",
      sortingField: "creationTime",
      cell: (group) => formatDate(group.creationTime),
    },
  ];
  // Khung hẹp: tầng 2 là retention · dung lượng, màu xám
  const compactColumns: TableProps.ColumnDefinition<LogGroup>[] = [
    {
      ...nameColumn,
      cell: (group) => (
        <div>
          {nameLink(group)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[retentionText(group), formatBytes(group.storedBytes)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(groups),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setModal("delete"),
    },
    { id: "create", text: "Create log group", primary: true, onClick: () => setModal("create") },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<LogGroup>("log group", nameOf)}
        trackBy={ID_FIELD}
        items={items}
        loading={groups.isLoading}
        loadingText='Loading log groups'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        empty={empty}
        header={
          <Header
            variant='awsui-h1-sticky'
            counter={groups.data ? `(${groups.data.length})` : undefined}
            description={`Logs that Lambda, ECS, RDS, DocumentDB, ElastiCache, Amazon MQ and your apps write to Floci. Region: ${region}.`}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Log groups
          </Header>
        }
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder='Filter by prefix, e.g. /aws/lambda/'
            onChange={({ detail }) => setFilterText(detail.filteringText)}
            onDelayedChange={({ detail }) => setPrefix(detail.filteringText.trim())}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {modal === "create" && <CreateLogGroupModal onDismiss={() => setModal(undefined)} />}
      {modal === "delete" && (
        <DeleteLogGroupsModal
          names={selected.map(nameOf)}
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
