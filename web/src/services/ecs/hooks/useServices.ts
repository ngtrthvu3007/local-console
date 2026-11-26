import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
  paginateListServices,
  type ECSClient,
} from "@aws-sdk/client-ecs";
import { chunks } from "@shared/aws.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { DESCRIBE_BATCH, LAUNCH_TYPE, STATUS } from "../constants.ts";
import type { ServiceValues } from "../schemas.ts";
import { clusterKey, useEcs } from "./useEcs.ts";

// Dưới key của cluster: chạy / dừng task cũng làm số liệu service đổi
const servicesKey = (cluster: string) => [...clusterKey(cluster), "services"];

async function describeServices(client: ECSClient, cluster: string, names: string[]) {
  const batches = await Promise.all(
    chunks(names, DESCRIBE_BATCH.services).map(
      async (batch) =>
        (await client.send(new DescribeServicesCommand({ cluster, services: batch }))).services,
    ),
  );
  return batches.flatMap((batch) => batch ?? []);
}

// enabled: cluster đã chắc có (ListServices với cluster lạ trả 400, "default" thì bị Floci tạo)
export function useServices(cluster: string, enabled: boolean) {
  const client = useEcs();

  return useQuery({
    queryKey: servicesKey(cluster),
    queryFn: async () => {
      const arns: string[] = [];
      for await (const page of paginateListServices({ client }, { cluster })) {
        arns.push(...(page.serviceArns ?? []));
      }
      return describeServices(client, cluster, arns);
    },
    enabled,
  });
}

// null = không có, hoặc đã xóa (INACTIVE)
export function useService(cluster: string, name: string, enabled: boolean) {
  const client = useEcs();

  return useQuery({
    // Ngoài key danh sách: xóa từ trang chi tiết không tải lại trang thành "not found" trước khi rời đi
    queryKey: [...clusterKey(cluster), "service", name],
    queryFn: async () => {
      const [service] = await describeServices(client, cluster, [name]);
      return service && service.status !== STATUS.inactive ? service : null;
    },
    enabled,
  });
}

const awsvpc = (values: Pick<ServiceValues, "subnets" | "securityGroups">) => ({
  awsvpcConfiguration: {
    subnets: values.subnets,
    securityGroups: values.securityGroups.length ? values.securityGroups : undefined,
  },
});

export function useCreateService(cluster: string) {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ServiceValues) => {
      await client.send(
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKey(cluster) }),
  });
}

export function useUpdateService(cluster: string, service: string) {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: { desiredCount: number; taskDefinition: string }) =>
      client.send(new UpdateServiceCommand({ cluster, service, ...update })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKey(cluster) }),
  });
}

// force: xóa cả khi còn task (như checkbox force delete của AWS). Floci 2.4.0 không dừng task của
// service đã xóa (AWS thì dừng): không tự dừng thay, modal nhắc dừng ở tab Tasks
export function useDeleteServices(cluster: string) {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: readonly string[]) =>
      runEach(
        names,
        (name) => name,
        (name) => client.send(new DeleteServiceCommand({ cluster, service: name, force: true })),
      ),
    // Danh sách service + số đếm trên header cluster; không đụng query chi tiết service (xóa từ trang
    // chi tiết mà tải lại nó thì trang thành "not found" trước khi kịp rời đi)
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: servicesKey(cluster) }),
        queryClient.invalidateQueries({ queryKey: clusterKey(cluster), exact: true }),
      ]),
  });
}
