import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { DETAIL_SEPARATOR, pluralize } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { AddInstanceModal } from "../components/AddInstanceModal.tsx";
import { ConnectivityTab } from "../components/ConnectivityTab.tsx";
import { DeleteClustersModal } from "../components/DeleteClustersModal.tsx";
import { InstancesTab } from "../components/InstancesTab.tsx";
import { CLUSTER_STATUS_STYLES, TEXT } from "../constants.ts";
import { instanceId, CLUSTER_TABS, docdbRoutes } from "@localconsole/core/docdb";
import { useCluster } from "../hooks/useClusters.ts";
import { clusterCrumbs } from "../routes.ts";

// Gợi ý tên instance kế tiếp chưa dùng: <cluster>-1, <cluster>-2…
const nextInstanceId = (cluster: string, taken: readonly (string | undefined)[]) => {
  let index = 0;
  while (taken.includes(instanceId(cluster, index))) index += 1;
  return instanceId(cluster, index);
};

export function ClusterDetail() {
  const { cluster: id = "" } = useParams();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(CLUSTER_TABS, CLUSTER_TABS.connectivity);
  const details = useCluster(id);
  const cluster = details.data ?? undefined;
  const [modal, setModal] = useState<"add" | "delete">();

  useBreadcrumbs(clusterCrumbs(id));

  const state = pageState(details, {
    ready: Boolean(cluster),
    notFound: details.data === null,
    title: `Cluster ${id} not found`,
    backHref: docdbRoutes.clusters,
    backText: "View clusters",
  });
  if (state || !cluster) return state;

  const barActions: BarAction[] = [
    refreshAction(details),
    { id: "delete", text: "Delete", onClick: () => setModal("delete") },
    { id: "add", text: "Add instance", primary: true, onClick: () => setModal("add") },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <StatusBadge status={cluster.status} styles={CLUSTER_STATUS_STYLES} />
          {DETAIL_SEPARATOR}
          {pluralize(cluster.instances.length, "instance")}
          {DETAIL_SEPARATOR}
          {TEXT.engine(cluster.engineVersion)}
        </>
      }
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      {id}
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
              id: CLUSTER_TABS.connectivity,
              label: "Connectivity",
              content: <ConnectivityTab cluster={cluster} />,
            },
            {
              id: CLUSTER_TABS.instances,
              label: "Instances",
              content: <InstancesTab instances={cluster.instances} onAdd={() => setModal("add")} />,
            },
          ]}
        />
      </ContentLayout>
      {modal === "add" && (
        <AddInstanceModal
          cluster={id}
          suggestedId={nextInstanceId(
            id,
            cluster.instances.map((instance) => instance.DBInstanceIdentifier),
          )}
          onDismiss={() => setModal(undefined)}
        />
      )}
      {modal === "delete" && (
        <DeleteClustersModal
          clusters={[cluster]}
          onDismiss={() => setModal(undefined)}
          onDone={() => navigate(docdbRoutes.clusters)}
        />
      )}
    </div>
  );
}
