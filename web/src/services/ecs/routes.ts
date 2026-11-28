import { ecsRoutes } from "@localconsole/core/ecs";

export const ecsClusterCrumbs = [
  { text: "Amazon ECS", href: ecsRoutes.clusters },
  { text: "Clusters", href: ecsRoutes.clusters },
];

export const ecsTaskDefinitionCrumbs = [
  { text: "Amazon ECS", href: ecsRoutes.clusters },
  { text: "Task definitions", href: ecsRoutes.taskDefinitions },
];

export const clusterCrumbs = (cluster: string) => [
  ...ecsClusterCrumbs,
  { text: cluster, href: ecsRoutes.cluster(cluster) },
];

export const familyCrumbs = (family: string) => [
  ...ecsTaskDefinitionCrumbs,
  { text: family, href: ecsRoutes.family(family) },
];

export const revisionCrumbs = (family: string, revision: number) => [
  ...familyCrumbs(family),
  { text: String(revision), href: ecsRoutes.revision(family, revision) },
];
