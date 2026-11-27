import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { clusterSample } from "../codeSamples.ts";
import { DeleteClustersModal } from "../components/DeleteClustersModal.tsx";
import { ServicesTab } from "../components/ServicesTab.tsx";
import { TasksTable } from "../components/TasksTable.tsx";
import { useCluster } from "../hooks/useClusters.ts";
import { useNetworkOptions } from "../hooks/useNetworkOptions.ts";
import { CLUSTER_TABS, clusterCrumbs, ecsRoutes } from "../routes.ts";

export function ClusterDetail() {
  const { cluster: name = "" } = useParams();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(CLUSTER_TABS, CLUSTER_TABS.services);
  const details = useCluster(name);
  const cluster = details.data ?? undefined;
  // Dữ liệu cluster trong cache có thể đã cũ (vd: Back sau khi xóa): chỉ gọi ListServices / ListTasks
  // khi lần mount này đã hỏi lại cluster, tránh 400 và tránh Floci tự tạo "default" (spec 7 #13)
  const confirmed = details.isFetchedAfterMount;
  const [defaultSubnet = ""] = useNetworkOptions().data?.defaults.subnets ?? [];
  const [deleting, setDeleting] = useState(false);

  useBreadcrumbs(clusterCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(cluster),
    notFound: details.data === null,
    title: `Cluster ${name} not found`,
    backHref: ecsRoutes.clusters,
    backText: "View clusters",
  });
  if (state || !cluster) return state;

  const barActions: BarAction[] = [
    refreshAction(details),
    { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
    { id: "run", text: "Run task", primary: true, href: ecsRoutes.runTask({ cluster: name }) },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {pluralize(cluster.activeServicesCount ?? 0, "service")}
          {DETAIL_SEPARATOR}
          {pluralize(cluster.runningTasksCount ?? 0, "running task")}
          {DETAIL_SEPARATOR}
          {pluralize(cluster.pendingTasksCount ?? 0, "pending task")}
          <StackLink separated type='AWS::ECS::Cluster' physicalId={name} />
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
        <SpaceBetween size='l'>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => setTab(detail.activeTabId)}
            tabs={[
              {
                id: CLUSTER_TABS.services,
                label: "Services",
                content: <ServicesTab cluster={name} enabled={confirmed} />,
              },
              {
                id: CLUSTER_TABS.tasks,
                label: "Tasks",
                content: <TasksTable cluster={name} enabled={confirmed} />,
              },
            ]}
          />
          <ConnectCard sample={clusterSample(name, defaultSubnet)} />
        </SpaceBetween>
      </ContentLayout>
      {deleting && (
        <DeleteClustersModal
          names={[name]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(ecsRoutes.clusters)}
        />
      )}
    </div>
  );
}
