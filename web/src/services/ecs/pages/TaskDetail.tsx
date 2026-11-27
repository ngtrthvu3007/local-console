import { useState } from "react";
import { useParams } from "react-router";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import {
  taskDefinitionRefOf,
  STATUS,
  CLUSTER_TABS,
  TASK_TABS,
  ecsRoutes,
} from "@localconsole/core/ecs";
import { TASKS_NOT_KEPT, TASK_STATUS_STYLES } from "../constants.ts";
import { ClusterLink } from "../components/ClusterLink.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { StopTasksModal } from "../components/StopTasksModal.tsx";
import { TaskContainersTab } from "../components/TaskContainersTab.tsx";
import { TaskDefinitionLink } from "../components/TaskDefinitionLink.tsx";
import { TaskLogsTab } from "../components/TaskLogsTab.tsx";
import { useCluster } from "../hooks/useClusters.ts";
import { useTaskDefinition } from "../hooks/useTaskDefinitions.ts";
import { useTask } from "../hooks/useTasks.ts";
import { clusterCrumbs } from "../routes.ts";

const DETAILS_COLUMNS = 3;

export function TaskDetail() {
  const { cluster: clusterName = "", taskId = "" } = useParams();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(TASK_TABS, TASK_TABS.containers);
  // Hỏi cluster trước: DescribeTasks với cluster không có trả 400 (spec 7 #13)
  const cluster = useCluster(clusterName);
  // Cache có thể còn cluster đã xóa: chỉ tin kết quả đã hỏi lại trong lần mount này
  const details = useTask(
    clusterName,
    taskId,
    Boolean(cluster.data) && cluster.isFetchedAfterMount,
  );
  const task = details.data ?? undefined;
  const definitionRef = taskDefinitionRefOf(task?.taskDefinitionArn ?? "");
  const definitionQuery = useTaskDefinition(definitionRef.family, definitionRef.revision);
  const definition = definitionQuery.data;
  const [stopping, setStopping] = useState(false);

  useBreadcrumbs([
    ...clusterCrumbs(clusterName),
    { text: taskId, href: ecsRoutes.task(clusterName, taskId) },
  ]);

  const clusterState = pageState(cluster, {
    ready: Boolean(cluster.data),
    notFound: cluster.data === null,
    title: `Cluster ${clusterName} not found`,
    backHref: ecsRoutes.clusters,
    backText: "View clusters",
  });
  if (clusterState) return clusterState;

  const state = pageState(details, {
    ready: Boolean(task),
    notFound: details.data === null,
    title: `Task ${taskId} not found`,
    description: TASKS_NOT_KEPT,
    backHref: ecsRoutes.cluster(clusterName, CLUSTER_TABS.tasks),
    backText: `View tasks of ${clusterName}`,
  });
  if (state || !task) return state;

  const barActions: BarAction[] = [
    refreshAction(details),
    {
      id: "stop",
      text: "Stop",
      disabled: task.desiredStatus === STATUS.stopped,
      onClick: () => setStopping(true),
    },
  ];

  return (
    <div ref={ref}>
      <ContentLayout
        header={
          <Header
            variant='h1'
            description={<StatusBadge status={task.lastStatus} styles={TASK_STATUS_STYLES} />}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Task {taskId}
          </Header>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Overview</Header>}>
            <KeyValuePairs
              columns={DETAILS_COLUMNS}
              items={[
                { label: "ARN", value: copyable(task.taskArn) },
                { label: "Cluster", value: <ClusterLink name={clusterName} /> },
                {
                  label: "Task definition",
                  value: <TaskDefinitionLink arn={task.taskDefinitionArn} />,
                },
                {
                  label: "Last status",
                  value: <StatusBadge status={task.lastStatus} styles={TASK_STATUS_STYLES} />,
                },
                { label: "Desired status", value: task.desiredStatus ?? NOT_AVAILABLE },
                { label: "Stop code", value: task.stopCode ?? NOT_AVAILABLE },
                { label: "Stopped reason", value: task.stoppedReason ?? NOT_AVAILABLE },
                { label: "Started by", value: task.startedBy ?? NOT_AVAILABLE },
                { label: "Group", value: task.group ?? NOT_AVAILABLE },
                { label: "Created", value: formatDate(task.createdAt) },
                { label: "Started", value: formatDate(task.startedAt) },
                { label: "Stopped", value: formatDate(task.stoppedAt) },
              ]}
            />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => setTab(detail.activeTabId)}
            tabs={[
              {
                id: TASK_TABS.containers,
                label: "Containers",
                content: <TaskContainersTab task={task} />,
              },
              {
                id: TASK_TABS.logs,
                label: "Logs",
                content: (
                  <TaskLogsTab
                    taskId={taskId}
                    definition={definition ?? undefined}
                    loading={definitionQuery.isLoading}
                  />
                ),
              },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      {stopping && (
        <StopTasksModal
          cluster={clusterName}
          arns={[task.taskArn ?? ""]}
          onDismiss={() => setStopping(false)}
          onDone={() => setStopping(false)}
        />
      )}
    </div>
  );
}
