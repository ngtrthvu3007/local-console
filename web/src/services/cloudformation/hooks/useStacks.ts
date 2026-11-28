import {
  CreateStackCommand,
  GetTemplateCommand,
  GetTemplateSummaryCommand,
  TemplateStage,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifyInfo, notifySuccess } from "@shared/hooks/useNotify.ts";
import { deleteStack, describeStack, listEvents, listResources, listStacks } from "../stacks.ts";
import { NO_CHANGES_NOTICE, STACK_POLL_INTERVAL_MS } from "../constants.ts";
import { isNoUpdatesError, isRunning } from "../status.ts";
import { CLOUDFORMATION_QUERY_ROOT, resourceIndexQueryKey } from "./useResourceIndex.ts";
import { useCloudFormation } from "./useCloudFormation.ts";

const stacksQueryKey = [CLOUDFORMATION_QUERY_ROOT, "stacks"];

const stackQueryKey = (name: string, part?: string) =>
  part
    ? [CLOUDFORMATION_QUERY_ROOT, "stack", name, part]
    : [CLOUDFORMATION_QUERY_ROOT, "stack", name];

// Poll khi còn stack đang chạy
const pollWhen = (running: boolean) => (running ? STACK_POLL_INTERVAL_MS : false);

export function useStacks() {
  const client = useCloudFormation();

  return useQuery({
    queryKey: stacksQueryKey,
    queryFn: () => listStacks(client),
    refetchInterval: ({ state }) =>
      pollWhen(Boolean(state.data?.some((stack) => isRunning(stack.StackStatus)))),
  });
}

export function useStack(name: string) {
  const client = useCloudFormation();

  return useQuery({
    queryKey: stackQueryKey(name),
    queryFn: () => describeStack(client, name),
    retry: false,
    refetchInterval: ({ state }) => pollWhen(isRunning(state.data?.StackStatus)),
  });
}

export function useStackDescription(name: string) {
  const client = useCloudFormation();

  return useQuery({
    queryKey: stackQueryKey(name, "description"),
    // Floci không trả Description trong DescribeStacks
    queryFn: async () =>
      (await client.send(new GetTemplateSummaryCommand({ StackName: name }))).Description ?? "",
    retry: false,
  });
}

export function useStackEvents(name: string, running: boolean) {
  const client = useCloudFormation();

  return useQuery({
    queryKey: stackQueryKey(name, "events"),
    queryFn: () => listEvents(client, name),
    refetchInterval: pollWhen(running),
  });
}

export function useStackResources(name: string, running: boolean) {
  const client = useCloudFormation();

  return useQuery({
    queryKey: stackQueryKey(name, "resources"),
    queryFn: () => listResources(client, name),
    refetchInterval: pollWhen(running),
  });
}

export function useStackTemplate(name: string) {
  const client = useCloudFormation();

  return useQuery({
    queryKey: stackQueryKey(name, "template"),
    // Original: Floci trả nguyên văn template đã deploy, kể cả comment (spec 7 #11)
    queryFn: async () =>
      (
        await client.send(
          new GetTemplateCommand({ StackName: name, TemplateStage: TemplateStage.Original }),
        )
      ).TemplateBody ?? "",
    retry: false,
    // Không giữ cache: stack xóa rồi tạo lại cùng tên sẽ mở nhầm template cũ, Deploy ghi đè
    gcTime: 0,
  });
}

// Báo kết quả ở đây chứ không ở trang: callback của mutate() không chạy khi người dùng đã
// rời trang. Lỗi thì trang tự hiện dưới editor nếu còn mở (pageOpen), không thì hiện flash
export function useDeployStack(editing: boolean, pageOpen: () => boolean) {
  const client = useCloudFormation();
  const queryClient = useQueryClient();

  return useMutation({
    // Floci chạy CreateStack đồng bộ (spec 7 #1): xong thì stack đã ở trạng thái cuối
    mutationFn: ({ name, template }: { name: string; template: string }) => {
      const input = { StackName: name, TemplateBody: template };

      return editing
        ? client.send(new UpdateStackCommand(input))
        : client.send(new CreateStackCommand(input));
    },
    onSuccess: (_, { name }) => {
      notifySuccess(`Deployed stack ${name}`);

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: stacksQueryKey }),
        queryClient.invalidateQueries({ queryKey: stackQueryKey(name) }),
        queryClient.invalidateQueries({ queryKey: resourceIndexQueryKey }),
      ]);
    },
    onError: (error, { name }) => {
      if (pageOpen()) return;

      if (isNoUpdatesError(error)) notifyInfo(NO_CHANGES_NOTICE);
      else notifyError(error, `Couldn't deploy ${name}`);
    },
  });
}

export function useDeleteStack() {
  const client = useCloudFormation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => deleteStack(client, name),
    // Không làm mới query của stack vừa xóa: trang chi tiết sẽ nháy not found (400)
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: stacksQueryKey }),
        queryClient.invalidateQueries({ queryKey: resourceIndexQueryKey }),
      ]),
    // DELETE_FAILED: trạng thái đã đổi
    onError: () => queryClient.invalidateQueries({ queryKey: [CLOUDFORMATION_QUERY_ROOT] }),
  });
}
