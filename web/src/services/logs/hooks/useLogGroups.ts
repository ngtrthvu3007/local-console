import { useMutation, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import {
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DeleteRetentionPolicyCommand,
  PutRetentionPolicyCommand,
  paginateDescribeLogGroups,
  type CloudWatchLogsClient,
  type LogGroup,
} from "@aws-sdk/client-cloudwatch-logs";
import { runEach } from "@shared/hooks/useNotify.ts";
import { LOGS_KEYS, LOGS_QUERY_ROOT } from "@shared/logs/constants.ts";
import { findLogGroup } from "@shared/logs/useLogEvents.ts";
import { useLogsClient } from "@shared/logs/useLogsClient.ts";

// Floci bỏ qua logGroupNamePattern nên lọc ở server theo prefix (spec 7 #2)
async function listGroups(client: CloudWatchLogsClient, prefix: string) {
  const groups: LogGroup[] = [];

  for await (const page of paginateDescribeLogGroups(
    { client },
    { logGroupNamePrefix: prefix || undefined },
  ))
    groups.push(...(page.logGroups ?? []));
  return groups;
}

export function useLogGroups(prefix: string) {
  const client = useLogsClient();
  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.groups, prefix],
    queryFn: () => listGroups(client, prefix),
  });
}

// null = không có.
// Key riêng (không dùng chung với danh sách) để khi xóa có thể bỏ qua query của chính group đó
export function useLogGroup(name: string) {
  const client = useLogsClient();
  return useQuery({
    queryKey: [LOGS_QUERY_ROOT, LOGS_KEYS.group, name],
    queryFn: async () => (await findLogGroup(client, name)) ?? null,
  });
}

const useInvalidateLogs = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LOGS_QUERY_ROOT] });
};

export function useCreateLogGroup() {
  const client = useLogsClient();
  const invalidate = useInvalidateLogs();

  return useMutation({
    mutationFn: async ({ name, days }: { name: string; days?: number }) => {
      await client.send(new CreateLogGroupCommand({ logGroupName: name }));
      // Group đã tạo xong: retention lỗi thì vẫn trả group (để mở trang của nó) kèm lỗi, không ném
      const retentionError =
        days === undefined
          ? undefined
          : await client
              .send(new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: days }))
              .then(
                () => undefined,
                (error: unknown) => error,
              );
      return { name, retentionError };
    },
    onSuccess: invalidate,
  });
}

export function useDeleteLogGroups() {
  const client = useLogsClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: readonly string[]) =>
      runEach(
        names,
        (name) => name,
        (name) => client.send(new DeleteLogGroupCommand({ logGroupName: name })),
      ),
    onSuccess: (_result, names) => {
      // Không tải lại query của chính group vừa xóa (chi tiết, stream, filter, event): Floci trả 400, và
      // trang chi tiết chuyển sang not found, gỡ modal xóa trước khi kịp quay về danh sách. Chúng vốn
      // đã cũ (staleTime 0) nên mount lần sau tự tải lại
      const ofDeleted = (query: Query) =>
        query.queryKey[1] !== LOGS_KEYS.groups && names.includes(String(query.queryKey[2]));
      return queryClient.invalidateQueries({
        queryKey: [LOGS_QUERY_ROOT],
        predicate: (query) => !ofDeleted(query),
      });
    },
  });
}

// undefined = Never expire: AWS bỏ retention bằng DeleteRetentionPolicy
export function usePutRetention(name: string) {
  const client = useLogsClient();
  const invalidate = useInvalidateLogs();

  return useMutation({
    mutationFn: async (days: number | undefined) => {
      if (days === undefined)
        await client.send(new DeleteRetentionPolicyCommand({ logGroupName: name }));
      else
        await client.send(
          new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: days }),
        );
    },
    onSuccess: invalidate,
  });
}
