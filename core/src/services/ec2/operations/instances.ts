import {
  DescribeImagesCommand,
  DescribeInstanceAttributeCommand,
  RebootInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  paginateDescribeInstances,
  type EC2Client,
} from "@aws-sdk/client-ec2";
import { collectPages } from "#shared/aws/pagination.ts";
import { NAME_TAG_KEY } from "#services/ec2/constants.ts";
import { INSTANCE_ACTIONS, type InstanceAction } from "#services/ec2/instances.ts";
import type { NewInstance } from "#services/ec2/schemas.ts";
import { decodeUserData, encodeUserData } from "#services/ec2/userData.ts";

export interface InstanceActionInput {
  id: string;
  action: InstanceAction;
}

// Catalog AMI của Floci (~30 mục): một lần tải
export const listImages = async (ec2: EC2Client) =>
  (await ec2.send(new DescribeImagesCommand({}))).Images ?? [];

export async function listInstances(ec2: EC2Client) {
  const reservations = await collectPages(
    paginateDescribeInstances({ client: ec2 }, {}),
    (page) => page.Reservations,
  );
  return reservations.flatMap((group) => group.Instances ?? []);
}

// null = không có instance (chưa từng có, hoặc Floci đã xóa hẳn sau ~1 giờ).
// Tìm trong cả danh sách thay vì DescribeInstances(InstanceIds): id không có thì Floci trả 400
// và trình duyệt ghi console.error
export const getInstance = async (ec2: EC2Client, id: string) =>
  (await listInstances(ec2)).find((instance) => instance.InstanceId === id) ?? null;

export async function getUserData(ec2: EC2Client, id: string) {
  const { UserData } = await ec2.send(
    new DescribeInstanceAttributeCommand({ InstanceId: id, Attribute: "userData" }),
  );
  return UserData?.Value ? decodeUserData(UserData.Value) : "";
}

export async function launchInstance(ec2: EC2Client, instance: NewInstance) {
  const { Instances = [] } = await ec2.send(
    new RunInstancesCommand({
      ImageId: instance.imageId,
      InstanceType: instance.instanceType,
      MinCount: 1,
      MaxCount: 1,
      UserData: instance.userData ? encodeUserData(instance.userData) : undefined,
      TagSpecifications: instance.name
        ? [{ ResourceType: "instance", Tags: [{ Key: NAME_TAG_KEY, Value: instance.name }] }]
        : undefined,
    }),
  );
  const id = Instances[0]?.InstanceId;
  // Không có id thì không dựng được link tới chi tiết: báo lỗi thay vì để router ném
  if (!id) throw new Error("Floci didn't return an instance ID.");
  return id;
}

export function runInstanceAction(ec2: EC2Client, { id, action }: InstanceActionInput) {
  const input = { InstanceIds: [id] };

  switch (action) {
    case INSTANCE_ACTIONS.stop:
      return ec2.send(new StopInstancesCommand(input));
    case INSTANCE_ACTIONS.start:
      return ec2.send(new StartInstancesCommand(input));
    case INSTANCE_ACTIONS.reboot:
      return ec2.send(new RebootInstancesCommand(input));
    case INSTANCE_ACTIONS.terminate:
      return ec2.send(new TerminateInstancesCommand(input));
  }
}
