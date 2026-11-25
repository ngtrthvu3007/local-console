import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { Instance } from "@aws-sdk/client-ec2";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import Grid, { type GridProps } from "@cloudscape-design/components/grid";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { InstanceStatus } from "../components/InstanceStatus.tsx";
import { useInstanceStateActions } from "../components/InstanceStateActions.tsx";
import { STATE_FILTER_ALL, STATE_FILTER_OPTIONS } from "../constants.ts";
import { useInstances } from "../hooks/useInstances.ts";
import { instanceId, instanceName, stateOf } from "../instances.ts";
import { ec2BaseCrumbs, ec2Routes } from "../routes.ts";

const ID_FIELD = "InstanceId";
const LAUNCH_TIME_FIELD = "LaunchTime";
// Ô tìm rộng đủ cho placeholder; khung hẹp thì ô lọc state xuống dòng dưới
const FILTER_GRID: GridProps.ElementDefinition[] = [
  { colspan: { default: 12, xs: 8 } },
  { colspan: { default: 12, xs: 4 } },
];

const matchesText = (instance: Instance, text: string) => {
  const query = text.toLowerCase();
  return [instanceName(instance), instanceId(instance)].some((value) =>
    value.toLowerCase().includes(query),
  );
};

export function InstanceList() {
  useBreadcrumbs(ec2BaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const instances = useInstances();
  const [state, setState] = useState(STATE_FILTER_ALL);

  const launchButton = (
    <Button variant='primary' href={ec2Routes.launchInstance} onFollow={follow}>
      Launch instance
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Instance>(instances.data ?? [], {
      filtering: {
        empty: emptyOrError(
          instances,
          <EmptyState
            title='No instances'
            description='Launch an instance, or create one with CDK, then refresh.'
            action={launchButton}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={
              <Button
                onClick={() => {
                  actions.setFiltering("");
                  setState(STATE_FILTER_ALL);
                }}
              >
                Clear filter
              </Button>
            }
          />
        ),
        // Lọc state ở đây chứ không lọc trước: useCollection chỉ hiện "No matches" khi danh sách gốc có item
        filteringFunction: (instance, text) =>
          (state === STATE_FILTER_ALL || stateOf(instance) === state) &&
          matchesText(instance, text),
      },
      // Instance mới launch nằm trên cùng
      sorting: {
        defaultState: { sortingColumn: { sortingField: LAUNCH_TIME_FIELD }, isDescending: true },
      },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  // Lấy bản mới nhất của dòng đang chọn: selectedItems giữ state cũ, menu sẽ khóa sai sau Stop / Start
  const selectedId = collectionProps.selectedItems?.[0]?.InstanceId;
  const selected = instances.data?.find((instance) => instanceId(instance) === selectedId);
  const stateActions = useInstanceStateActions(selected);

  const nameCell = (instance: Instance) => (
    <Link href={ec2Routes.instance(instanceId(instance))} onFollow={follow}>
      {instanceName(instance)}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<Instance> = {
    id: "name",
    header: "Name",
    isRowHeader: true,
    cell: nameCell,
  };
  const stateColumn: TableProps.ColumnDefinition<Instance> = {
    id: "state",
    header: "State",
    cell: (instance) => <InstanceStatus instance={instance} />,
  };

  const wideColumns: TableProps.ColumnDefinition<Instance>[] = [
    nameColumn,
    { id: "id", header: "Instance ID", sortingField: ID_FIELD, cell: instanceId },
    stateColumn,
    { id: "type", header: "Type", cell: (instance) => instance.InstanceType ?? NOT_AVAILABLE },
    {
      id: "launched",
      header: "Launch time",
      sortingField: LAUNCH_TIME_FIELD,
      cell: (instance) => formatDate(instance.LaunchTime),
    },
  ];

  // Khung hẹp: tầng 2 là ID, type và giờ launch, màu xám
  const compactColumns: TableProps.ColumnDefinition<Instance>[] = [
    {
      ...nameColumn,
      cell: (instance) => (
        <div>
          {nameCell(instance)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[instanceId(instance), instance.InstanceType, formatDate(instance.LaunchTime)]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    stateColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(instances),
    { id: "launch", text: "Launch instance", primary: true, href: ec2Routes.launchInstance },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={instances.data ? `(${instances.data.length})` : undefined}
      description={`EC2 instances running as containers in Floci. Region: ${region}.`}
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={stateActions.menuItems}
          onMenuItemClick={stateActions.onMenuItemClick}
        />
      }
    >
      Instances
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<Instance>("instance", instanceId)}
        trackBy={ID_FIELD}
        items={items}
        loading={instances.isLoading}
        loadingText='Loading instances'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <Grid gridDefinition={FILTER_GRID}>
            <TextFilter
              {...filterProps}
              filteringPlaceholder='Find instances by name or ID'
              countText={`${filteredItemsCount ?? 0} matches`}
            />
            <Select
              selectedOption={STATE_FILTER_OPTIONS.find((option) => option.value === state) ?? null}
              options={STATE_FILTER_OPTIONS}
              onChange={({ detail }) => setState(detail.selectedOption.value ?? STATE_FILTER_ALL)}
              ariaLabel='Filter by state'
            />
          </Grid>
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {stateActions.modal}
    </div>
  );
}
