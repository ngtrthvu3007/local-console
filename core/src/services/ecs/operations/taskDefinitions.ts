import {
  DeleteTaskDefinitionsCommand,
  DeregisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
  paginateListTaskDefinitionFamilies,
  paginateListTaskDefinitions,
  type ECSClient,
  type RegisterTaskDefinitionCommandInput,
} from "@aws-sdk/client-ecs";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { revisionsOfFamily, taskDefinitionLabel, taskDefinitionRefOf } from "#services/ecs/arns.ts";
import { REVISION_STATUSES, type RevisionStatus } from "#services/ecs/constants.ts";

export interface RevisionRow {
  arn: string;
  family: string;
  revision: number;
  status: RevisionStatus;
}

export type FamilyStatus = Extract<RevisionStatus, "ACTIVE" | "INACTIVE">;

export const listFamilies = (ecs: ECSClient, status: FamilyStatus) =>
  collectPages(
    paginateListTaskDefinitionFamilies({ client: ecs }, { status }),
    (page) => page.families,
  );

// Mỗi status một lần List để biết status mà không Describe từng revision (spec 3.6)
export async function listRevisions(ecs: ECSClient, family: string): Promise<RevisionRow[]> {
  const byStatus = await Promise.all(
    REVISION_STATUSES.map(async (status) => {
      const arns = await collectPages(
        paginateListTaskDefinitions({ client: ecs }, { familyPrefix: family, status }),
        (page) => page.taskDefinitionArns,
      );
      // ARN của ListTaskDefinitions luôn có revision; bỏ qua cho chắc kiểu
      return revisionsOfFamily(arns, family).flatMap((arn) => {
        const { revision } = taskDefinitionRefOf(arn);
        return revision === undefined ? [] : [{ arn, family, revision, status }];
      });
    }),
  );
  return byStatus.flat().sort((a, b) => b.revision - a.revision);
}

// null = revision không có. Kiểm trong danh sách trước: Describe revision lạ trả 400 → console.error
export async function getTaskDefinition(ecs: ECSClient, family: string, revision: number) {
  const rows = await listRevisions(ecs, family);
  if (!rows.some((row) => row.revision === revision)) return null;

  const { taskDefinition } = await ecs.send(
    new DescribeTaskDefinitionCommand({ taskDefinition: `${family}:${revision}` }),
  );
  return taskDefinition ?? null;
}

export async function registerTaskDefinition(
  ecs: ECSClient,
  input: RegisterTaskDefinitionCommandInput,
) {
  const { taskDefinition } = await ecs.send(new RegisterTaskDefinitionCommand(input));
  return taskDefinitionRefOf(taskDefinition?.taskDefinitionArn ?? "");
}

export const deregisterRevisions = (ecs: ECSClient, arns: readonly string[]) =>
  runEach(arns, taskDefinitionLabel, (arn) =>
    ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn })),
  );

// AWS chỉ xóa revision đã deregister; Floci để chúng ở DELETE_IN_PROGRESS mãi (spec 7 #9)
export const deleteRevisions = (ecs: ECSClient, arns: readonly string[]) =>
  runEach(arns, taskDefinitionLabel, (arn) =>
    ecs.send(new DeleteTaskDefinitionsCommand({ taskDefinitions: [arn] })),
  );
