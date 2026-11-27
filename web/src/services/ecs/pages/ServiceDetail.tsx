import { useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import type { Deployment, ServiceEvent } from "@aws-sdk/client-ecs";
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
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import {
  DETAIL_SEPARATOR,
  LIST_SEPARATOR,
  NOT_AVAILABLE,
  formatDate,
} from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteServicesModal } from "../components/DeleteServicesModal.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { TaskDefinitionLink } from "../components/TaskDefinitionLink.tsx";
import { TasksTable } from "../components/TasksTable.tsx";
import { UpdateServiceModal } from "../components/UpdateServiceModal.tsx";
import { SERVICE_STATUS_STYLES } from "../constants.ts";
import { useCluster } from "../hooks/useClusters.ts";
import { clusterKey } from "../hooks/useEcsService.ts";
import { useService } from "../hooks/useServices.ts";
import { SERVICE_TABS, ecsRoutes } from "@localconsole/core/ecs";
import { clusterCrumbs } from "../routes.ts";

const DETAILS_COLUMNS = 3;

const eventColumns: TableProps.ColumnDefinition<ServiceEvent>[] = [
  { id: "time", header: "Time", cell: (event) => formatDate(event.createdAt) },
  { id: "message", header: "Message", isRowHeader: true, cell: (event) => event.message },
];

const deploymentColumns: TableProps.ColumnDefinition<Deployment>[] = [
  { id: "status", header: "Status", isRowHeader: true, cell: (row) => row.status },
  {
    id: "definition",
    header: "Task definition",
    cell: (row) => <TaskDefinitionLink arn={row.taskDefinition} />,
  },
  { id: "rollout", header: "Rollout", cell: (row) => row.rolloutState ?? NOT_AVAILABLE },
  {
    id: "tasks",
    header: "Running / desired",
    cell: (row) => `${row.runningCount ?? 0} / ${row.desiredCount ?? 0}`,
  },
];

export function ServiceDetail() {
  const { cluster: clusterName = "", service: name = "" } = useParams();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(SERVICE_TABS, SERVICE_TABS.tasks);
  // Hỏi cluster trước: DescribeServices với cluster không có trả 400 (spec 7 #13)
  const cluster = useCluster(clusterName);
  // Cache có thể còn cluster đã xóa: chỉ tin kết quả đã hỏi lại trong lần mount này
  const details = useService(
    clusterName,
    name,
    Boolean(cluster.data) && cluster.isFetchedAfterMount,
  );
  const service = details.data ?? undefined;
  const [modal, setModal] = useState<"update" | "delete">();
  const queryClient = useQueryClient();
  const fetchingCluster = useIsFetching({ queryKey: clusterKey(clusterName) });

  useBreadcrumbs([
    ...clusterCrumbs(clusterName),
    { text: name, href: ecsRoutes.service(clusterName, name) },
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
    ready: Boolean(service),
    notFound: details.data === null,
    title: `Service ${name} not found`,
    backHref: ecsRoutes.cluster(clusterName),
    backText: `View services of ${clusterName}`,
  });
  if (state || !service) return state;

  const network = service.networkConfiguration?.awsvpcConfiguration;
  // Refresh ở header tải lại cả service lẫn bảng Tasks (cùng key của cluster)
  const refreshAll = {
    isFetching: fetchingCluster > 0,
    refetch: () => queryClient.invalidateQueries({ queryKey: clusterKey(clusterName) }),
  };
  const barActions: BarAction[] = [
    refreshAction(refreshAll),
    { id: "delete", text: "Delete", onClick: () => setModal("delete") },
    { id: "update", text: "Update", primary: true, onClick: () => setModal("update") },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <StatusBadge status={service.status} styles={SERVICE_STATUS_STYLES} />
          {DETAIL_SEPARATOR}
          {`Desired ${service.desiredCount ?? 0} · Running ${service.runningCount ?? 0} · Pending ${service.pendingCount ?? 0}`}
          <StackLink separated type='AWS::ECS::Service' physicalId={service.serviceArn ?? ""} />
        </>
      }
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      {name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => setTab(detail.activeTabId)}
          tabs={[
            {
              id: SERVICE_TABS.tasks,
              label: "Tasks",
              content: <TasksTable cluster={clusterName} serviceName={name} enabled />,
            },
            {
              id: SERVICE_TABS.events,
              label: "Events",
              content: (
                <Table
                  items={service.events ?? []}
                  trackBy={(event) => event.id ?? ""}
                  columnDefinitions={eventColumns}
                  wrapLines
                  header={<Header counter={`(${service.events?.length ?? 0})`}>Events</Header>}
                />
              ),
            },
            {
              id: SERVICE_TABS.configuration,
              label: "Configuration",
              content: (
                <SpaceBetween size='l'>
                  <Container header={<Header variant='h2'>Configuration</Header>}>
                    <KeyValuePairs
                      columns={DETAILS_COLUMNS}
                      items={[
                        { label: "ARN", value: copyable(service.serviceArn) },
                        {
                          label: "Task definition",
                          value: <TaskDefinitionLink arn={service.taskDefinition} />,
                        },
                        { label: "Launch type", value: service.launchType ?? NOT_AVAILABLE },
                        {
                          label: "Subnets",
                          value: network?.subnets?.join(LIST_SEPARATOR) || NOT_AVAILABLE,
                        },
                        {
                          label: "Security groups",
                          value: network?.securityGroups?.join(LIST_SEPARATOR) || NOT_AVAILABLE,
                        },
                        { label: "Created", value: formatDate(service.createdAt) },
                      ]}
                    />
                  </Container>
                  <Table
                    items={service.deployments ?? []}
                    trackBy={(row) => row.id ?? ""}
                    columnDefinitions={deploymentColumns}
                    header={
                      <Header counter={`(${service.deployments?.length ?? 0})`}>Deployments</Header>
                    }
                  />
                </SpaceBetween>
              ),
            },
          ]}
        />
      </ContentLayout>
      {modal === "update" && (
        <UpdateServiceModal
          cluster={clusterName}
          service={service}
          onDismiss={() => setModal(undefined)}
        />
      )}
      {modal === "delete" && (
        <DeleteServicesModal
          cluster={clusterName}
          names={[name]}
          onDismiss={() => setModal(undefined)}
          onDone={() => navigate(ecsRoutes.cluster(clusterName))}
        />
      )}
    </div>
  );
}
