import {
  CreateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
  paginateListServices,
  type ECSClient,
} from "@aws-sdk/client-ecs";
import { chunks, collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { DESCRIBE_BATCH, LAUNCH_TYPE, STATUS } from "#services/ecs/constants.ts";
import type { ServiceValues } from "#services/ecs/schemas.ts";

export interface ServiceUpdate {
  desiredCount: number;
  taskDefinition: string;
}

async function describeServices(ecs: ECSClient, cluster: string, names: readonly string[]) {
  const batches = await Promise.all(
    chunks(names, DESCRIBE_BATCH.services).map(
      async (batch) =>
        (await ecs.send(new DescribeServicesCommand({ cluster, services: batch }))).services,
    ),
  );
  return batches.flatMap((batch) => batch ?? []);
}

// Chỉ gọi khi cluster đã chắc có: ListServices với cluster lạ trả 400, "default" thì bị Floci tạo
export async function listServices(ecs: ECSClient, cluster: string) {
  const arns = await collectPages(
    paginateListServices({ client: ecs }, { cluster }),
    (page) => page.serviceArns,
  );
  return describeServices(ecs, cluster, arns);
}

// null = không có, hoặc đã xóa (INACTIVE)
export async function getService(ecs: ECSClient, cluster: string, name: string) {
  const [service] = await describeServices(ecs, cluster, [name]);
  return service && service.status !== STATUS.inactive ? service : null;
}

const awsvpc = (values: Pick<ServiceValues, "subnets" | "securityGroups">) => ({
  awsvpcConfiguration: {
    subnets: values.subnets,
    securityGroups: values.securityGroups.length ? values.securityGroups : undefined,
  },
});

export async function createService(ecs: ECSClient, cluster: string, values: ServiceValues) {
  await ecs.send(
    new CreateServiceCommand({
      cluster,
      serviceName: values.name,
      taskDefinition: `${values.family}:${values.revision}`,
      desiredCount: values.desiredCount,
      launchType: LAUNCH_TYPE,
      networkConfiguration: awsvpc(values),
    }),
  );
  return values.name;
}

export const updateService = (
  ecs: ECSClient,
  cluster: string,
  service: string,
  update: ServiceUpdate,
) => ecs.send(new UpdateServiceCommand({ cluster, service, ...update }));

// force: xóa cả khi còn task (như checkbox force delete của AWS). Floci 2.4.0 không dừng task của
// service đã xóa (AWS thì dừng): không tự dừng thay, modal nhắc dừng ở tab Tasks
export const deleteServices = (ecs: ECSClient, cluster: string, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    (name) => ecs.send(new DeleteServiceCommand({ cluster, service: name, force: true })),
  );
