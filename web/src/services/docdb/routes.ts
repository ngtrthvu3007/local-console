import { docdbRoutes } from "@localconsole/core/docdb";

export const docdbBaseCrumbs = [
  { text: "Amazon DocumentDB", href: docdbRoutes.clusters },
  { text: "Clusters", href: docdbRoutes.clusters },
];

export const clusterCrumbs = (cluster: string) => [
  ...docdbBaseCrumbs,
  { text: cluster, href: docdbRoutes.cluster(cluster) },
];
