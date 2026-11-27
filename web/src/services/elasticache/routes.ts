import { elasticacheRoutes } from "@localconsole/core/elasticache";

export const elasticacheBaseCrumbs = [
  { text: "Amazon ElastiCache", href: elasticacheRoutes.clusters },
  { text: "Clusters", href: elasticacheRoutes.clusters },
];

export const clusterCrumbs = (cluster: string) => [
  ...elasticacheBaseCrumbs,
  { text: cluster, href: elasticacheRoutes.cluster(cluster) },
];
