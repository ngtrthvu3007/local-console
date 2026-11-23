import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteStack,
  describeStack,
  listEvents,
  listResources,
  listStacks,
  stackDescription,
} from "../stacks.ts";
import { STACK_POLL_INTERVAL_MS } from "../constants.ts";
import { isRunning } from "../status.ts";
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
    queryFn: () => stackDescription(client, name),
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
