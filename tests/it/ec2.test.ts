import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DescribeImagesCommand,
  DescribeInstanceAttributeCommand,
  DescribeInstancesCommand,
  EC2Client,
  RebootInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  type Instance,
} from "@aws-sdk/client-ec2";
import { consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Đúng các lệnh trang EC2 dùng, qua proxy /aws của console. Instance là container do Floci bật

const instanceName = uniqueName("ec2");
// Có tiếng Việt: console mã hóa UTF-8 trước khi base64
const USER_DATA = "#!/bin/bash\necho 'xin chào' > /tmp/hello";
const NAME_TAG = {
  ResourceType: "instance" as const,
  Tags: [{ Key: "Name", Value: instanceName }],
};

let ec2: EC2Client;
let instanceId = "";

const describeInstance = async (): Promise<Instance | undefined> =>
  (await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))).Reservations?.[0]
    ?.Instances?.[0];

const waitForState = (state: string) =>
  waitFor(`${instanceId} to be ${state}`, async () => {
    const instance = await describeInstance();
    return instance?.State?.Name === state ? instance : undefined;
  });

beforeAll(async () => {
  ec2 = new EC2Client(viaConsole((await consoleConfig()).region));
});

afterAll(async () => {
  if (instanceId)
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] })).catch(() => {});
});

describe("instances", () => {
  it("lists the AMI catalog, with Amazon Linux 2023 for the default", async () => {
    const { Images = [] } = await ec2.send(new DescribeImagesCommand({}));

    expect(
      Images.some(
        (image) => image.Description === "Amazon Linux 2023 AMI" && image.Architecture === "x86_64",
      ),
    ).toBe(true);
  });

  it("launches an instance with a Name tag and user data, in the default VPC", async () => {
    const { Images = [] } = await ec2.send(new DescribeImagesCommand({}));
    const imageId =
      Images.find((image) => image.Description === "Amazon Linux 2023 AMI")?.ImageId ?? "";
    const { Instances = [] } = await ec2.send(
      new RunInstancesCommand({
        ImageId: imageId,
        InstanceType: "t3.micro",
        MinCount: 1,
        MaxCount: 1,
        UserData: Buffer.from(USER_DATA).toString("base64"),
        TagSpecifications: [NAME_TAG],
      }),
    );
    instanceId = Instances[0]?.InstanceId ?? "";
    const running = await waitForState("running");

    expect(instanceId).toMatch(/^i-/);
    expect(running.Tags?.find((tag) => tag.Key === "Name")?.Value).toBe(instanceName);
    expect(running.VpcId).toBeTruthy();
  });

  it("reads the user data back exactly", async () => {
    const { UserData } = await ec2.send(
      new DescribeInstanceAttributeCommand({ InstanceId: instanceId, Attribute: "userData" }),
    );

    expect(Buffer.from(UserData?.Value ?? "", "base64").toString("utf8")).toBe(USER_DATA);
  });

  it("stops and starts the instance (stop takes about 30 seconds)", async () => {
    await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState("stopped");
    await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));

    expect((await waitForState("running")).InstanceId).toBe(instanceId);
  });

  it("reboots the instance", async () => {
    await ec2.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));

    expect((await waitForState("running")).InstanceId).toBe(instanceId);
  });

  it("terminates the instance and still lists it as terminated", async () => {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));

    expect((await waitForState("terminated")).InstanceId).toBe(instanceId);
  });
});
