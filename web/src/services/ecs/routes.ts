import { generatePath } from "react-router";
import { withQuery, withTab } from "@shared/routes.ts";

export const ECS_SERVICE_ID = "ecs";
const ECS_ROOT = `/${ECS_SERVICE_ID}`;

// Tab đầu tiên của mỗi trang là mặc định, không ghi lên URL
export const CLUSTER_TABS = { services: "services", tasks: "tasks" } as const;
export const SERVICE_TABS = {
  tasks: "tasks",
  events: "events",
  configuration: "configuration",
} as const;
export const TASK_TABS = { containers: "containers", logs: "logs" } as const;
export const REVISION_TABS = { containers: "containers", json: "json" } as const;

export const SEARCH_PARAMS = {
  cluster: "cluster",
  taskDefinition: "taskDefinition",
  from: "from",
} as const;

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const ECS_ROUTE_PATTERNS = {
  clusters: "clusters",
  cluster: "clusters/:cluster",
  runTask: "run-task",
  task: "clusters/:cluster/tasks/:taskId",
  createService: "clusters/:cluster/services/create",
  service: "clusters/:cluster/services/:service",
  taskDefinitions: "task-definitions",
  createTaskDefinition: "task-definitions/create",
  family: "task-definitions/:family",
  revision: "task-definitions/:family/:revision",
} as const;

const fullPath = (pattern: string) => `${ECS_ROOT}/${pattern}`;

type Tab<T> = T[keyof T];

export const ecsRoutes = {
  clusters: fullPath(ECS_ROUTE_PATTERNS.clusters),
  cluster: (cluster: string, tab?: Tab<typeof CLUSTER_TABS>) =>
    withTab(
      generatePath(fullPath(ECS_ROUTE_PATTERNS.cluster), { cluster }),
      tab,
      CLUSTER_TABS.services,
    ),
  runTask: (prefill: { cluster?: string; taskDefinition?: string } = {}) =>
    withQuery(fullPath(ECS_ROUTE_PATTERNS.runTask), {
      [SEARCH_PARAMS.cluster]: prefill.cluster,
      [SEARCH_PARAMS.taskDefinition]: prefill.taskDefinition,
    }),
  task: (cluster: string, taskId: string, tab?: Tab<typeof TASK_TABS>) =>
    withTab(
      generatePath(fullPath(ECS_ROUTE_PATTERNS.task), { cluster, taskId }),
      tab,
      TASK_TABS.containers,
    ),
  createService: (cluster: string) =>
    generatePath(fullPath(ECS_ROUTE_PATTERNS.createService), { cluster }),
  service: (cluster: string, service: string, tab?: Tab<typeof SERVICE_TABS>) =>
    withTab(
      generatePath(fullPath(ECS_ROUTE_PATTERNS.service), { cluster, service }),
      tab,
      SERVICE_TABS.tasks,
    ),
  taskDefinitions: fullPath(ECS_ROUTE_PATTERNS.taskDefinitions),
  // from: "<family>:<revision>" để điền sẵn khi tạo revision mới
  createTaskDefinition: (from?: string) =>
    withQuery(fullPath(ECS_ROUTE_PATTERNS.createTaskDefinition), { [SEARCH_PARAMS.from]: from }),
  family: (family: string) => generatePath(fullPath(ECS_ROUTE_PATTERNS.family), { family }),
  // Không có revision (ARN trỏ family) thì về danh sách revision của family
  revision: (family: string, revision?: number, tab?: Tab<typeof REVISION_TABS>) =>
    revision === undefined
      ? generatePath(fullPath(ECS_ROUTE_PATTERNS.family), { family })
      : withTab(
          generatePath(fullPath(ECS_ROUTE_PATTERNS.revision), {
            family,
            revision: String(revision),
          }),
          tab,
          REVISION_TABS.containers,
        ),
};

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
