import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { Task } from "@aws-sdk/client-ecs";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { taskIdOf } from "../arns.ts";
import {
  DESIRED_STATUSES,
  STATUS,
  TASKS_NOT_KEPT,
  TASK_STATUS_STYLES,
  type DesiredStatus,
} from "../constants.ts";
import { useTasks } from "../hooks/useTasks.ts";
import { exitCodeText } from "../tasks.ts";
import { ecsRoutes } from "../routes.ts";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { StopTasksModal } from "./StopTasksModal.tsx";
import { TaskDefinitionLink } from "./TaskDefinitionLink.tsx";

const ARN_FIELD = "taskArn";
const STATUS_OPTIONS = Object.entries(DESIRED_STATUSES).map(([id, text]) => ({ id, text }));

const isDesiredStatus = (value: string): value is DesiredStatus => value in DESIRED_STATUSES;

interface Props {
  cluster: string;
  serviceName?: string;
  // Cluster đã chắc có: ListTasks với cluster lạ trả 400, "default" thì bị Floci tạo (spec 7 #13)
  enabled: boolean;
}

// Bảng task của cluster, hoặc của một service khi có serviceName
export function TasksTable({ cluster, serviceName, enabled }: Props) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const [desiredStatus, setDesiredStatus] = useState<DesiredStatus>(STATUS.running);
  const tasks = useTasks(cluster, { desiredStatus, serviceName }, enabled);
  const [stopping, setStopping] = useState(false);
  const runTaskHref = ecsRoutes.runTask({ cluster });

  const { items, collectionProps, paginationProps, actions } = useCollection<Task>(
    tasks.data ?? [],
    {
      filtering: {
        empty: emptyOrError(
          tasks,
          <EmptyState
            title={desiredStatus === STATUS.running ? "No running tasks" : "No stopped tasks"}
            description={TASKS_NOT_KEPT}
          />,
        ),
      },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: ARN_FIELD },
    },
  );
  const selected = collectionProps.selectedItems ?? [];

  const idLink = (task: Task) => {
    const taskId = taskIdOf(task.taskArn ?? "");
    return (
      <Link href={ecsRoutes.task(cluster, taskId)} onFollow={follow}>
        {taskId}
      </Link>
    );
  };
  const idColumn: TableProps.ColumnDefinition<Task> = {
    id: "task",
    header: "Task",
    isRowHeader: true,
    cell: idLink,
  };
  const statusColumn: TableProps.ColumnDefinition<Task> = {
    id: "status",
    header: "Last status",
    cell: (task) => <StatusBadge status={task.lastStatus} styles={TASK_STATUS_STYLES} />,
  };

  const wideColumns: TableProps.ColumnDefinition<Task>[] = [
    idColumn,
    statusColumn,
    {
      id: "definition",
      header: "Task definition",
      cell: (task) => <TaskDefinitionLink arn={task.taskDefinitionArn} />,
    },
    { id: "startedBy", header: "Started by", cell: (task) => task.startedBy ?? NOT_AVAILABLE },
    { id: "startedAt", header: "Started at", cell: (task) => formatDate(task.startedAt) },
    { id: "exit", header: "Exit code", cell: (task) => exitCodeText(task) ?? NOT_AVAILABLE },
  ];
  // Khung hẹp: tầng 2 là thời điểm chạy · người chạy, màu xám
  const compactColumns: TableProps.ColumnDefinition<Task>[] = [
    {
      ...idColumn,
      cell: (task) => (
        <div>
          {idLink(task)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[formatDate(task.startedAt), task.startedBy ?? NOT_AVAILABLE].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(tasks),
    { id: "stop", text: "Stop", disabled: !selected.length, onClick: () => setStopping(true) },
    { id: "run", text: "Run task", primary: true, href: runTaskHref },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<Task>("task", (task) => taskIdOf(task.taskArn ?? ""))}
        trackBy={ARN_FIELD}
        items={items}
        loading={tasks.isLoading}
        loadingText='Loading tasks'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            counter={tasks.data ? `(${tasks.data.length})` : undefined}
            description={TASKS_NOT_KEPT}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Tasks
          </Header>
        }
        filter={
          <SegmentedControl
            label='Desired status'
            selectedId={desiredStatus}
            options={STATUS_OPTIONS}
            onChange={({ detail }) => {
              if (isDesiredStatus(detail.selectedId)) setDesiredStatus(detail.selectedId);
              actions.setSelectedItems([]);
            }}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {stopping && (
        <StopTasksModal
          cluster={cluster}
          arns={selected.map((task) => task.taskArn ?? "")}
          onDismiss={() => setStopping(false)}
          onDone={() => {
            setStopping(false);
            actions.setSelectedItems([]);
          }}
        />
      )}
    </div>
  );
}
