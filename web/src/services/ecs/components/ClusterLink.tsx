import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useClusters } from "../hooks/useClusters.ts";
import { ecsRoutes, type CLUSTER_TABS } from "@localconsole/core/ecs";

interface Props {
  name: string;
  tab?: (typeof CLUSTER_TABS)[keyof typeof CLUSTER_TABS];
}

// Tên cluster thành link; dò bằng danh sách, không gọi ListTasks / ListServices với cluster lạ
// (400 → console.error, và tên "default" thì Floci tự tạo cluster, spec 7 #13)
export function ClusterLink({ name, tab }: Props) {
  const clusters = useClusters().data;
  const missing = clusters !== undefined && !clusters.some((cluster) => cluster.name === name);
  return <ReferenceLink name={name} href={ecsRoutes.cluster(name, tab)} missing={missing} />;
}
