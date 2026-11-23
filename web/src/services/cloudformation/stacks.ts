import {
  CloudFormationClient,
  DeleteStackCommand,
  DescribeStacksCommand,
  GetTemplateSummaryCommand,
  paginateDescribeStackEvents,
  paginateDescribeStacks,
  paginateListStackResources,
  type Stack,
  type StackEvent,
  type StackResourceSummary,
} from "@aws-sdk/client-cloudformation";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import {
  DELETE_COMPLETE_STATUS,
  DELETE_FAILED_STATUS,
  DELETE_WAIT_MAX_POLLS,
  STACK_POLL_INTERVAL_MS,
} from "./constants.ts";
import type { StackWithResources } from "./resourceIndex.ts";

const MISSING_STACK_MESSAGE = "does not exist";

export const cloudFormationClient = (region: string) =>
  new CloudFormationClient({
    region,
    credentials: AWS_TEST_CREDENTIALS,
    endpoint: proxyEndpoint(),
  });

// Stack không có: Floci trả ValidationError "Stack with id X does not exist"
export const isStackMissing = (error: unknown) => {
  const { name, message } = error as Partial<Error>;
  return name === "ValidationError" && Boolean(message?.includes(MISSING_STACK_MESSAGE));
};

// Ẩn stack đã xóa
export async function listStacks(client: CloudFormationClient): Promise<Stack[]> {
  const stacks: Stack[] = [];
  for await (const page of paginateDescribeStacks({ client }, {})) {
    stacks.push(...(page.Stacks ?? []));
  }
  return stacks.filter((stack) => stack.StackStatus !== DELETE_COMPLETE_STATUS);
}

export async function describeStack(client: CloudFormationClient, name: string): Promise<Stack> {
  const { Stacks } = await client.send(new DescribeStacksCommand({ StackName: name }));
  const stack = Stacks?.[0];
  if (!stack) throw new Error(`Stack ${name} ${MISSING_STACK_MESSAGE}`);
  return stack;
}

// Floci không trả Description trong DescribeStacks
export async function stackDescription(client: CloudFormationClient, name: string) {
  const { Description } = await client.send(new GetTemplateSummaryCommand({ StackName: name }));
  return Description ?? "";
}

// Giữ thứ tự API: nhiều event cùng mili giây
export async function listEvents(
  client: CloudFormationClient,
  name: string,
): Promise<StackEvent[]> {
  const events: StackEvent[] = [];
  for await (const page of paginateDescribeStackEvents({ client }, { StackName: name })) {
    events.push(...(page.StackEvents ?? []));
  }
  return events;
}

export async function listResources(
  client: CloudFormationClient,
  name: string,
): Promise<StackResourceSummary[]> {
  const resources: StackResourceSummary[] = [];
  for await (const page of paginateListStackResources({ client }, { StackName: name })) {
    resources.push(...(page.StackResourceSummaries ?? []));
  }
  return resources;
}

// Mọi stack kèm resource còn sống (cho index của StackLink)
export async function listStacksWithResources(
  client: CloudFormationClient,
): Promise<StackWithResources[]> {
  const stacks = await listStacks(client);
  return Promise.all(
    stacks.map(async (stack) => {
      const name = stack.StackName ?? "";
      const resources = await listResources(client, name);
      return {
        name,
        resources: resources.flatMap((resource) =>
          resource.PhysicalResourceId && resource.ResourceStatus !== DELETE_COMPLETE_STATUS
            ? [{ type: resource.ResourceType ?? "", physicalId: resource.PhysicalResourceId }]
            : [],
        ),
      };
    }),
  );
}

// Hỏi bằng danh sách: DescribeStacks(tên) trả 400 khi stack đã mất (console.error)
export async function deleteStack(client: CloudFormationClient, name: string) {
  await client.send(new DeleteStackCommand({ StackName: name }));
  for (let poll = 0; poll < DELETE_WAIT_MAX_POLLS; poll++) {
    const stack = (await listStacks(client)).find((candidate) => candidate.StackName === name);
    if (!stack) return;
    if (stack.StackStatus === DELETE_FAILED_STATUS) {
      throw new Error(stack.StackStatusReason ?? `Stack ${name} ${DELETE_FAILED_STATUS}`);
    }
    await new Promise((resolve) => setTimeout(resolve, STACK_POLL_INTERVAL_MS));
  }
  throw new Error(`Stack ${name} is still deleting`);
}
