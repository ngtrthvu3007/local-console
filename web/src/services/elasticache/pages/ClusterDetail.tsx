import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { nounFor } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteClustersModal } from "../components/DeleteClustersModal.tsx";
import { DetailsTab } from "../components/DetailsTab.tsx";
import { KeysTab } from "../components/KeysTab.tsx";
import {
  addressText,
  engineLabel,
  isTransitional,
  useCluster,
  type Cluster,
} from "../hooks/useClusters.ts";
import { useServerInfo } from "../hooks/useRedis.ts";
import {
  CLUSTER_TABS,
  SEARCH_PARAMS,
  clusterCrumbs,
  elasticacheRoutes,
  type ClusterTab,
} from "../routes.ts";

const isClusterTab = (value: string | null): value is ClusterTab =>
  Object.values<string | null>(CLUSTER_TABS).includes(value);

// "Valkey · localhost:6379 · 1,204 keys": thay cho khối overview, để mở tab là thấy danh sách key
function clusterSummary(cluster: Cluster, keyCount?: number) {
  return [
    engineLabel(cluster.engine),
    cluster.endpoint && addressText(cluster.endpoint),
    keyCount !== undefined && `${keyCount.toLocaleString()} ${nounFor(keyCount, "key")}`,
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
}

export function ClusterDetail() {
  const { cluster: clusterId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isClusterTab(requestedTab) ? requestedTab : CLUSTER_TABS.keys;
  const details = useCluster(clusterId);
  const cluster = details.data;
  // Số key cho dòng mô tả; cluster chưa hỗ trợ xem key thì bỏ qua
  const info = useServerInfo(clusterId, Boolean(cluster && !isTransitional(cluster)));
  const [deleting, setDeleting] = useState(false);

  useBreadcrumbs(clusterCrumbs(clusterId));

  // Đổi tab thì đóng panel (bỏ key khỏi URL)
  const selectTab = (nextTab: string) =>
    setSearchParams(nextTab === CLUSTER_TABS.keys ? {} : { [SEARCH_PARAMS.tab]: nextTab });

  // Floci trả danh sách: cluster không có trong danh sách (mà không lỗi) là không tồn tại
  const state = pageState(details, {
    ready: Boolean(cluster),
    notFound: !cluster && !details.isError,
    title: `Cluster ${clusterId} not found`,
    backHref: elasticacheRoutes.clusters,
    backText: "View clusters",
  });
  if (state || !cluster) return state;

  const keyCount = info.data?.keys;
  const tabs: TabsProps.Tab[] = [
    {
      id: CLUSTER_TABS.keys,
      label: "Keys",
      content: <KeysTab cluster={cluster} keyCount={keyCount} />,
    },
    { id: CLUSTER_TABS.details, label: "Details", content: <DetailsTab cluster={cluster} /> },
  ];

  const headerActions = (
    <ResponsiveActions>
      <CopyButton
        label='Copy endpoint'
        text={cluster.endpoint ? addressText(cluster.endpoint) : undefined}
      />
      <Button onClick={() => setDeleting(true)}>Delete</Button>
    </ResponsiveActions>
  );

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {clusterSummary(cluster, keyCount)}
          {cluster.kind === "cache-cluster" && (
            <StackLink separated type='AWS::ElastiCache::CacheCluster' physicalId={cluster.id} />
          )}
        </>
      }
      actions={headerActions}
    >
      {cluster.id}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <Tabs
        activeTabId={tab}
        tabs={tabs}
        onChange={({ detail }) => selectTab(detail.activeTabId)}
      />
      {deleting && (
        <DeleteClustersModal
          clusters={[cluster]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(elasticacheRoutes.clusters)}
        />
      )}
    </ContentLayout>
  );
}
