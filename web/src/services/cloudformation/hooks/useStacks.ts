import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isNoUpdatesError,
  isRunning,
  STACK_POLL_INTERVAL_MS,
  type StackTemplateInput,
} from "@localconsole/core/cloudformation";
import { notifyError, notifyInfo, notifySuccess } from "@shared/hooks/useNotify.ts";
import { NO_CHANGES_NOTICE } from "../constants.ts";
import { useCloudFormationService } from "./useCloudFormationService.ts";
import { CLOUDFORMATION_QUERY_ROOT, resourceIndexQueryKey } from "./useResourceIndex.ts";

const stacksQueryKey = [CLOUDFORMATION_QUERY_ROOT, "stacks"];

const stackQueryKey = (name: string, part?: string) =>
  part
    ? [CLOUDFORMATION_QUERY_ROOT, "stack", name, part]
    : [CLOUDFORMATION_QUERY_ROOT, "stack", name];

// Poll khi còn stack đang chạy
const pollWhen = (running: boolean) => (running ? STACK_POLL_INTERVAL_MS : false);

export function useStacks() {
  const cloudformation = useCloudFormationService();

  return useQuery({
    queryKey: stacksQueryKey,
    queryFn: cloudformation.listStacks,
    refetchInterval: ({ state }) =>
      pollWhen(Boolean(state.data?.some((stack) => isRunning(stack.StackStatus)))),
  });
}

export function useStack(name: string) {
  const cloudformation = useCloudFormationService();

  return useQuery({
    queryKey: stackQueryKey(name),
    queryFn: () => cloudformation.getStack(name),
    retry: false,
    refetchInterval: ({ state }) => pollWhen(isRunning(state.data?.StackStatus)),
  });
}

export function useStackDescription(name: string) {
  const cloudformation = useCloudFormationService();

  return useQuery({
    queryKey: stackQueryKey(name, "description"),
    queryFn: () => cloudformation.getStackDescription(name),
    retry: false,
  });
}

export function useStackEvents(name: string, running: boolean) {
  const cloudformation = useCloudFormationService();

  return useQuery({
    queryKey: stackQueryKey(name, "events"),
    queryFn: () => cloudformation.listEvents(name),
    refetchInterval: pollWhen(running),
  });
}

export function useStackResources(name: string, running: boolean) {
  const cloudformation = useCloudFormationService();

  return useQuery({
    queryKey: stackQueryKey(name, "resources"),
    queryFn: () => cloudformation.listResources(name),
    refetchInterval: pollWhen(running),
  });
}

export function useStackTemplate(name: string) {
  const cloudformation = useCloudFormationService();

  return useQuery({
    queryKey: stackQueryKey(name, "template"),
    queryFn: () => cloudformation.getTemplate(name),
    retry: false,
    // Không giữ cache: stack xóa rồi tạo lại cùng tên sẽ mở nhầm template cũ, Deploy ghi đè
    gcTime: 0,
  });
}

// Báo kết quả ở đây chứ không ở trang: callback của mutate() không chạy khi người dùng đã
// rời trang. Lỗi thì trang tự hiện dưới editor nếu còn mở (pageOpen), không thì hiện flash
export function useDeployStack(editing: boolean, pageOpen: () => boolean) {
  const cloudformation = useCloudFormationService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StackTemplateInput) => cloudformation.deployStack(input, editing),
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
  const cloudformation = useCloudFormationService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cloudformation.deleteStack,
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
