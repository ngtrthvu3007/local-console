import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DescribeInstanceAttributeCommand,
  EC2Client,
  RebootInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  paginateDescribeInstances,
  type Instance,
} from "@aws-sdk/client-ec2";
import { INSTANCE_POLL_INTERVAL_MS, NAME_TAG_KEY } from "../constants.ts";
import { INSTANCE_ACTIONS, isTransitional, type InstanceAction } from "../instances.ts";
import type { NewInstance } from "../schemas.ts";
import { decodeUserData, encodeUserData } from "../userData.ts";
import { useEC2 } from "./useEC2.ts";

// Mọi query của EC2 nằm dưới key gốc này
const EC2_QUERY_ROOT = "ec2";
const instancesQueryKey = [EC2_QUERY_ROOT, "instances"];
const instanceQueryKey = (id: string) => [EC2_QUERY_ROOT, "instance", id];

async function listInstances(client: EC2Client) {
  const instances: Instance[] = [];

  for await (const page of paginateDescribeInstances({ client }, {})) {
    instances.push(...(page.Reservations ?? []).flatMap((group) => group.Instances ?? []));
  }

  return instances;
}

export function useInstances() {
  const client = useEC2();

  return useQuery({
    queryKey: instancesQueryKey,
    queryFn: () => listInstances(client),
    refetchInterval: (query) =>
      query.state.data?.some(isTransitional) ? INSTANCE_POLL_INTERVAL_MS : false,
  });
}

// null = không có instance (chưa từng có, hoặc Floci đã xóa hẳn sau ~1 giờ).
// Tìm trong cả danh sách thay vì DescribeInstances(InstanceIds): id không có thì Floci trả 400
// và trình duyệt ghi console.error
export function useInstance(id: string) {
  const client = useEC2();

  return useQuery({
    queryKey: instanceQueryKey(id),
    queryFn: async () =>
      (await listInstances(client)).find((instance) => instance.InstanceId === id) ?? null,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? INSTANCE_POLL_INTERVAL_MS : false,
  });
}

export function useUserData(id: string) {
  const client = useEC2();

  return useQuery({
    queryKey: [...instanceQueryKey(id), "user-data"],
    queryFn: async () => {
      const { UserData } = await client.send(
        new DescribeInstanceAttributeCommand({ InstanceId: id, Attribute: "userData" }),
      );
      return UserData?.Value ? decodeUserData(UserData.Value) : "";
    },
  });
}

export function useLaunchInstance() {
  const client = useEC2();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instance: NewInstance) => {
      const { Instances = [] } = await client.send(
        new RunInstancesCommand({
          ImageId: instance.imageId,
          InstanceType: instance.instanceType,
          MinCount: 1,
          MaxCount: 1,
          UserData: instance.userData ? encodeUserData(instance.userData) : undefined,
          TagSpecifications: instance.name
            ? [
                {
                  ResourceType: "instance",
                  Tags: [{ Key: NAME_TAG_KEY, Value: instance.name }],
                },
              ]
            : undefined,
        }),
      );
      const id = Instances[0]?.InstanceId;
      // Không có id thì không dựng được link tới chi tiết: báo lỗi thay vì để router ném
      if (!id) throw new Error("Floci didn't return an instance ID.");
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: instancesQueryKey }),
  });
}

export function useInstanceAction() {
  const client = useEC2();
  const queryClient = useQueryClient();

  const send = (id: string, action: InstanceAction) => {
    const input = { InstanceIds: [id] };

    switch (action) {
      case INSTANCE_ACTIONS.stop:
        return client.send(new StopInstancesCommand(input));
      case INSTANCE_ACTIONS.start:
        return client.send(new StartInstancesCommand(input));
      case INSTANCE_ACTIONS.reboot:
        return client.send(new RebootInstancesCommand(input));
      case INSTANCE_ACTIONS.terminate:
        return client.send(new TerminateInstancesCommand(input));
    }
  };

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: InstanceAction }) => send(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EC2_QUERY_ROOT] }),
  });
}
