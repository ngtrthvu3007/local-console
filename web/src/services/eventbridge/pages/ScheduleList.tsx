import { useState } from "react";
import { useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
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
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { CreateGroupModal } from "../components/CreateGroupModal.tsx";
import { EnabledState } from "../components/EnabledState.tsx";
import { DeleteGroupModal } from "../components/DeleteGroupModal.tsx";
import { DeleteSchedulesModal } from "../components/DeleteSchedulesModal.tsx";
import { TargetResource } from "../components/TargetResource.tsx";
import { DEFAULT_SCHEDULE_GROUP } from "../constants.ts";
import { useScheduleGroups, useSchedules, useSetSchedulesEnabled } from "../hooks/useSchedules.ts";
import { SEARCH_PARAMS, eventbridgeRoutes, schedulesCrumbs } from "../routes.ts";
import type { ScheduleRow } from "../schedules.ts";
import { TARGET_KINDS, resourceNameOfArn, targetKindOfArn } from "../targets.ts";

const NAME_FIELD = "name";
const ALL_GROUPS = "";
const PAGE_SIZE = 50;

const targetLabel = (row: ScheduleRow) =>
  `${TARGET_KINDS[targetKindOfArn(row.targetArn)]} ${resourceNameOfArn(row.targetArn)}`;
const rowKey = (row: ScheduleRow) => `${row.group}/${row.name}`;

type Modal = "delete" | "createGroup" | "deleteGroup" | null;

export function ScheduleList() {
  useBreadcrumbs(schedulesCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const [searchParams, setSearchParams] = useSearchParams();
  const group = searchParams.get(SEARCH_PARAMS.group) ?? ALL_GROUPS;
  const groups = useScheduleGroups();
  const schedules = useSchedules(group || undefined);
  const setEnabled = useSetSchedulesEnabled();
  const [modal, setModal] = useState<Modal>(null);

  // Floci trả danh sách rỗng cho group không có (AWS báo lỗi), nên tự so với danh sách group
  const unknownGroup = Boolean(group) && Boolean(groups.data) && !groups.data?.includes(group);
  const createGroup = unknownGroup ? undefined : group;

  const createButton = (
    <Button
      variant='primary'
      href={eventbridgeRoutes.createSchedule(createGroup)}
      onFollow={follow}
    >
      Create schedule
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<ScheduleRow>(schedules.data ?? [], {
      filtering: {
        empty: emptyOrError(
          schedules,
          unknownGroup ? (
            <EmptyState
              title={`Schedule group ${group} not found`}
              description='It may have been deleted, or the name is wrong.'
              action={<Button onClick={() => changeGroup(ALL_GROUPS)}>View all groups</Button>}
            />
          ) : (
            <EmptyState
              title='No schedules'
              description={group ? `The ${group} group has no schedules.` : undefined}
              action={createButton}
            />
          ),
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: rowKey },
    });

  const selected = collectionProps.selectedItems ?? [];

  const changeGroup = (name: string) => {
    actions.setSelectedItems([]);
    setSearchParams(name ? { [SEARCH_PARAMS.group]: name } : {});
  };
  const finishDelete = () => {
    setModal(null);
    actions.setSelectedItems([]);
  };
  const setState = (enabled: boolean) =>
    setEnabled.mutate(
      { rows: selected, enabled },
      notifyBulkOutcome({
        success: (result) =>
          `${enabled ? "Enabled" : "Disabled"} ${pluralize(result.count, "schedule")}`,
        errorHeader: `Couldn't ${enabled ? "enable" : "disable"}`,
      }),
    );

  const nameLink = (row: ScheduleRow) => (
    <Link href={eventbridgeRoutes.schedule(row.group, row.name)} onFollow={follow}>
      {row.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<ScheduleRow> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const wideColumns: TableProps.ColumnDefinition<ScheduleRow>[] = [
    nameColumn,
    { id: "group", header: "Group", sortingField: "group", cell: (row) => row.group },
    {
      id: "target",
      header: "Target",
      cell: (row) => (
        <>
          {TARGET_KINDS[targetKindOfArn(row.targetArn)]} <TargetResource arn={row.targetArn} />
        </>
      ),
    },
    { id: "state", header: "State", cell: (row) => <EnabledState enabled={row.enabled} /> },
  ];
  // Khung hẹp: tầng 1 là tên + state, tầng 2 là group + đích
  const compactColumns: TableProps.ColumnDefinition<ScheduleRow>[] = [
    {
      ...nameColumn,
      cell: (row) => (
        <div>
          <SpaceBetween size='xs' direction='horizontal'>
            {nameLink(row)}
            <EnabledState enabled={row.enabled} />
          </SpaceBetween>
          <Box variant='small' display='block' color='text-body-secondary'>
            {[row.group, targetLabel(row)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(schedules),
    {
      id: "enable",
      text: "Enable",
      disabled: !selected.length,
      loading: setEnabled.isPending,
      onClick: () => setState(true),
    },
    {
      id: "disable",
      text: "Disable",
      disabled: !selected.length,
      loading: setEnabled.isPending,
      onClick: () => setState(false),
    },
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setModal("delete") },
    {
      id: "create",
      text: "Create schedule",
      primary: true,
      href: eventbridgeRoutes.createSchedule(createGroup),
    },
  ];

  const groupOptions = [
    { value: ALL_GROUPS, label: "All groups" },
    ...(groups.data ?? []).map((name) => ({ value: name, label: name })),
  ];
  // Group default không xóa được; "All groups" không phải một group
  const canDeleteGroup = Boolean(group) && !unknownGroup && group !== DEFAULT_SCHEDULE_GROUP;

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={schedules.data ? `(${schedules.data.length})` : undefined}
      description='Schedules run a target once or on a recurring schedule.'
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Schedules
    </Header>
  );

  const filter = (
    <SpaceBetween size='s'>
      <FormField label='Schedule group'>
        {/* Khung hẹp: ô chọn (cao 44px trên phone) một hàng riêng, nút (cao 32px) ở hàng dưới, để khỏi lệch nhau */}
        <SpaceBetween
          size='xs'
          direction={compact ? "vertical" : "horizontal"}
          alignItems={compact ? "start" : "center"}
        >
          <div className='console-inline-select'>
            <Select
              selectedOption={
                groupOptions.find((option) => option.value === group) ?? {
                  value: group,
                  label: group,
                }
              }
              options={groupOptions}
              onChange={({ detail }) => changeGroup(detail.selectedOption.value ?? ALL_GROUPS)}
            />
          </div>
          <SpaceBetween size='xs' direction='horizontal'>
            <Button onClick={() => setModal("createGroup")}>Create group</Button>
            <Button disabled={!canDeleteGroup} onClick={() => setModal("deleteGroup")}>
              Delete group
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </FormField>
      <TextFilter
        {...filterProps}
        filteringPlaceholder='Find schedules by name'
        countText={`${filteredItemsCount ?? 0} matches`}
      />
    </SpaceBetween>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<ScheduleRow>("schedule", (row) => row.name)}
        trackBy={rowKey}
        items={items}
        loading={schedules.isLoading}
        loadingText='Loading schedules'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {modal === "delete" && (
        <DeleteSchedulesModal
          schedules={selected}
          onDismiss={() => setModal(null)}
          onDone={finishDelete}
        />
      )}
      {modal === "createGroup" && (
        <CreateGroupModal onCreated={changeGroup} onDismiss={() => setModal(null)} />
      )}
      {modal === "deleteGroup" && (
        <DeleteGroupModal
          group={group}
          onDismiss={() => setModal(null)}
          onDone={() => {
            setModal(null);
            changeGroup(ALL_GROUPS);
          }}
        />
      )}
    </div>
  );
}
