import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
  GetTemplateSummaryCommand,
  TemplateStage,
  UpdateStackCommand,
  paginateDescribeStackEvents,
  paginateDescribeStacks,
  paginateListStackResources,
  type CloudFormationClient,
  type Stack,
} from "@aws-sdk/client-cloudformation";
import { collectPages } from "#shared/aws/pagination.ts";
import {
  DELETE_COMPLETE_STATUS,
  DELETE_FAILED_STATUS,
  DELETE_WAIT_MAX_POLLS,
  STACK_POLL_INTERVAL_MS,
} from "#services/cloudformation/constants.ts";
import type { StackWithResources } from "#services/cloudformation/resourceIndex.ts";

export interface StackTemplateInput {
  name: string;
  template: string;
}

const MISSING_STACK_MESSAGE = "does not exist";

// Stack không có: Floci trả ValidationError "Stack with id X does not exist"
export const isStackMissing = (error: unknown) =>
  error instanceof Error &&
  error.name === "ValidationError" &&
  error.message.includes(MISSING_STACK_MESSAGE);

// Ẩn stack đã xóa
export async function listStacks(cloudformation: CloudFormationClient): Promise<Stack[]> {
  const stacks = await collectPages(
    paginateDescribeStacks({ client: cloudformation }, {}),
    (page) => page.Stacks,
  );
  return stacks.filter((stack) => stack.StackStatus !== DELETE_COMPLETE_STATUS);
}

export async function getStack(cloudformation: CloudFormationClient, name: string) {
  const { Stacks } = await cloudformation.send(new DescribeStacksCommand({ StackName: name }));
  const stack = Stacks?.[0];
  if (!stack) throw new Error(`Stack ${name} ${MISSING_STACK_MESSAGE}`);
  return stack;
}

// Floci không trả Description trong DescribeStacks
export const getStackDescription = async (cloudformation: CloudFormationClient, name: string) =>
  (await cloudformation.send(new GetTemplateSummaryCommand({ StackName: name }))).Description ?? "";

// Original: Floci trả nguyên văn template đã deploy, kể cả comment (spec 7 #11)
export const getTemplate = async (cloudformation: CloudFormationClient, name: string) =>
  (
    await cloudformation.send(
      new GetTemplateCommand({ StackName: name, TemplateStage: TemplateStage.Original }),
    )
  ).TemplateBody ?? "";

// Giữ thứ tự API: nhiều event cùng mili giây
export const listEvents = (cloudformation: CloudFormationClient, name: string) =>
  collectPages(
    paginateDescribeStackEvents({ client: cloudformation }, { StackName: name }),
    (page) => page.StackEvents,
  );

export const listResources = (cloudformation: CloudFormationClient, name: string) =>
  collectPages(
    paginateListStackResources({ client: cloudformation }, { StackName: name }),
    (page) => page.StackResourceSummaries,
  );

// Mọi stack kèm resource còn sống (cho index của StackLink)
export async function listStacksWithResources(
  cloudformation: CloudFormationClient,
): Promise<StackWithResources[]> {
  const stacks = await listStacks(cloudformation);

  return Promise.all(
    stacks.map(async (stack) => {
      const name = stack.StackName ?? "";
      const resources = await listResources(cloudformation, name);

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

// Floci chạy CreateStack đồng bộ (spec 7 #1): xong thì stack đã ở trạng thái cuối
export function deployStack(
  cloudformation: CloudFormationClient,
  { name, template }: StackTemplateInput,
  editing: boolean,
) {
  const input = { StackName: name, TemplateBody: template };
  return editing
    ? cloudformation.send(new UpdateStackCommand(input))
    : cloudformation.send(new CreateStackCommand(input));
}

// Hỏi bằng danh sách: DescribeStacks(tên) trả 400 khi stack đã mất (console.error)
export async function deleteStack(cloudformation: CloudFormationClient, name: string) {
  await cloudformation.send(new DeleteStackCommand({ StackName: name }));

  for (let poll = 0; poll < DELETE_WAIT_MAX_POLLS; poll++) {
    const stack = (await listStacks(cloudformation)).find(
      (candidate) => candidate.StackName === name,
    );
    if (!stack) return;

    if (stack.StackStatus === DELETE_FAILED_STATUS) {
      throw new Error(stack.StackStatusReason ?? `Stack ${name} ${DELETE_FAILED_STATUS}`);
    }

    await new Promise((resolve) => setTimeout(resolve, STACK_POLL_INTERVAL_MS));
  }

  throw new Error(`Stack ${name} is still deleting`);
}
