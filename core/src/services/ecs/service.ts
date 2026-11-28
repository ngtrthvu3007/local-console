import type {
  ECSClient,
  RegisterTaskDefinitionCommandInput,
  RunTaskCommandInput,
} from "@aws-sdk/client-ecs";
import type { LogsService } from "#services/logs/service.ts";
import type { ServiceValues } from "./schemas.ts";
import { createCluster, deleteClusters, getCluster, listClusters } from "./operations/clusters.ts";
import {
  createService,
  deleteServices,
  getService,
  listServices,
  updateService,
  type ServiceUpdate,
} from "./operations/services.ts";
import {
  deleteRevisions,
  deregisterRevisions,
  getTaskDefinition,
  listFamilies,
  listRevisions,
  registerTaskDefinition,
  type FamilyStatus,
} from "./operations/taskDefinitions.ts";
import {
  getTask,
  getTaskLogs,
  listTasks,
  runTask,
  stopTasks,
  type LogTarget,
  type TaskFilter,
} from "./operations/tasks.ts";

interface EcsDeps {
  logs: LogsService;
}

export function createEcsService(ecs: ECSClient, { logs }: EcsDeps) {
  return {
    listClusters: () => listClusters(ecs),
    getCluster: (name: string) => getCluster(ecs, name),
    createCluster: (name: string) => createCluster(ecs, name),
    deleteClusters: (names: readonly string[]) => deleteClusters(ecs, names),

    listServices: (cluster: string) => listServices(ecs, cluster),
    getService: (cluster: string, name: string) => getService(ecs, cluster, name),
    createService: (cluster: string, values: ServiceValues) => createService(ecs, cluster, values),
    updateService: (cluster: string, service: string, update: ServiceUpdate) =>
      updateService(ecs, cluster, service, update),
    deleteServices: (cluster: string, names: readonly string[]) =>
      deleteServices(ecs, cluster, names),

    listFamilies: (status: FamilyStatus) => listFamilies(ecs, status),
    listRevisions: (family: string) => listRevisions(ecs, family),
    getTaskDefinition: (family: string, revision: number) =>
      getTaskDefinition(ecs, family, revision),
    registerTaskDefinition: (input: RegisterTaskDefinitionCommandInput) =>
      registerTaskDefinition(ecs, input),
    deregisterRevisions: (arns: readonly string[]) => deregisterRevisions(ecs, arns),
    deleteRevisions: (arns: readonly string[]) => deleteRevisions(ecs, arns),

    listTasks: (cluster: string, filter: TaskFilter) => listTasks(ecs, cluster, filter),
    getTask: (cluster: string, taskId: string) => getTask(ecs, cluster, taskId),
    runTask: (input: RunTaskCommandInput) => runTask(ecs, input),
    stopTasks: (cluster: string, arns: readonly string[]) => stopTasks(ecs, cluster, arns),
    getTaskLogs: (target: LogTarget) => getTaskLogs(logs, target),
  };
}

export type EcsService = ReturnType<typeof createEcsService>;
