import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { runEach } from "@shared/hooks/useNotify.ts";
import { revisionsOfFamily, taskDefinitionLabel, taskDefinitionRefOf } from "../arns.ts";
import { enumOfKeys } from "@shared/schemas.ts";
import { REVISION_STATUS_STYLES, type RevisionStatus } from "../constants.ts";
import { ECS_QUERY_ROOT, useEcs } from "./useEcs.ts";

const taskDefinitionsKey = [ECS_QUERY_ROOT, "taskDefinitions"];

export interface RevisionRow {
  arn: string;
  family: string;
  revision: number;
  status: RevisionStatus;
}

export type FamilyStatus = Extract<RevisionStatus, "ACTIVE" | "INACTIVE">;

export function useFamilies(status: FamilyStatus) {
  const client = useEcs();

  return useQuery({
    queryKey: [...taskDefinitionsKey, "families", status],
    queryFn: async () => {
      const families: string[] = [];
      for await (const page of paginateListTaskDefinitionFamilies({ client }, { status })) {
        families.push(...(page.families ?? []));
      }
      return families;
    },
  });
}

const REVISION_STATUSES = enumOfKeys(REVISION_STATUS_STYLES).options;

// Mỗi status một lần List để biết status mà không Describe từng revision (spec 3.6)
async function listRevisions(client: ECSClient, family: string): Promise<RevisionRow[]> {
  const byStatus = await Promise.all(
    REVISION_STATUSES.map(async (status) => {
      const arns: string[] = [];
      for await (const page of paginateListTaskDefinitions(
        { client },
        { familyPrefix: family, status },
      )) {
        arns.push(...(page.taskDefinitionArns ?? []));
      }
      // ARN của ListTaskDefinitions luôn có revision; bỏ qua cho chắc kiểu
      return revisionsOfFamily(arns, family).flatMap((arn) => {
        const { revision } = taskDefinitionRefOf(arn);
        return revision === undefined ? [] : [{ arn, family, revision, status }];
      });
    }),
  );
  return byStatus.flat().sort((a, b) => b.revision - a.revision);
}

export function useRevisions(family: string) {
  const client = useEcs();

  return useQuery({
    queryKey: [...taskDefinitionsKey, "revisions", family],
    queryFn: () => listRevisions(client, family),
    enabled: Boolean(family),
  });
}

// null = revision không có. Kiểm trong danh sách trước: Describe revision lạ trả 400 → console.error
export function useTaskDefinition(family: string, revision?: number) {
  const client = useEcs();

  return useQuery({
    queryKey: [...taskDefinitionsKey, "detail", family, revision],
    queryFn: async () => {
      if (revision === undefined) return null;
      const rows = await listRevisions(client, family);
      if (!rows.some((row) => row.revision === revision)) return null;

      const { taskDefinition } = await client.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: `${family}:${revision}` }),
      );
      return taskDefinition ?? null;
    },
    enabled: Boolean(family),
  });
}

export function useRegisterTaskDefinition() {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterTaskDefinitionCommandInput) => {
      const { taskDefinition } = await client.send(new RegisterTaskDefinitionCommand(input));
      return taskDefinitionRefOf(taskDefinition?.taskDefinitionArn ?? "");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskDefinitionsKey }),
  });
}

export function useDeregisterRevisions() {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (arns: readonly string[]) =>
      runEach(arns, taskDefinitionLabel, (arn) =>
        client.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn })),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskDefinitionsKey }),
  });
}

// AWS chỉ xóa revision đã deregister; Floci để chúng ở DELETE_IN_PROGRESS mãi (spec 7 #9)
export function useDeleteRevisions() {
  const client = useEcs();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (arns: readonly string[]) =>
      runEach(arns, taskDefinitionLabel, (arn) =>
        client.send(new DeleteTaskDefinitionsCommand({ taskDefinitions: [arn] })),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskDefinitionsKey }),
  });
}
