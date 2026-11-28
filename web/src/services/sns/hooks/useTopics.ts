import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isTopicMissing,
  topicArn,
  type CreateTopicInput,
  type PublishInput,
  type SnsService,
  type Topic,
} from "@localconsole/core/sns";
import { existsQuery } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { lastArnPart } from "@localconsole/core/shared";
import { useSnsService } from "./useSnsService.ts";

export const SNS_QUERY_ROOT = "sns";
const topicsQueryKey = [SNS_QUERY_ROOT, "topics"];
const anyTopicQueryKey = [SNS_QUERY_ROOT, "topic"];
export const topicQueryKey = (topic: string, part?: string) =>
  part ? [...anyTopicQueryKey, topic, part] : [...anyTopicQueryKey, topic];
const DETAILS = "details";

// Nơi khác tham chiếu tới topic (S3 rule, trigger…) còn trỏ được không.
// Query option dùng chung: trang service khác truyền facade SNS của nó
export const topicExistsQuery = (sns: Pick<SnsService, "getTopic">, arn: string) =>
  existsQuery(
    topicQueryKey(lastArnPart(arn), "exists"),
    () => sns.getTopic(lastArnPart(arn)),
    isTopicMissing,
  );

export function useTopicExists(name: string) {
  const sns = useSnsService();
  const { region } = useLoadedConfig();
  return useQuery(topicExistsQuery(sns, topicArn(region, name)));
}

export function useTopics() {
  const sns = useSnsService();

  return useQuery({ queryKey: topicsQueryKey, queryFn: sns.listTopics });
}

export function useTopic(name: string) {
  const sns = useSnsService();

  return useQuery({
    queryKey: topicQueryKey(name, DETAILS),
    queryFn: () => sns.getTopic(name),
    retry: false,
  });
}

export function useInvalidateTopic() {
  const queryClient = useQueryClient();

  return (topic: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: topicQueryKey(topic) }),
      queryClient.invalidateQueries({ queryKey: topicsQueryKey }),
    ]);
}

export function useCreateTopic() {
  const sns = useSnsService();
  const invalidate = useInvalidateTopic();

  return useMutation({
    mutationFn: (input: CreateTopicInput) => sns.createTopic(input),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useDeleteTopics() {
  const sns = useSnsService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (topics: readonly Topic[]) => sns.deleteTopics(topics),
    // Xóa topic kéo theo subscription của nó, kể cả khối SNS ở trang queue / function
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SNS_QUERY_ROOT] }),
  });
}

export function usePublish(topic: Topic) {
  const sns = useSnsService();

  return useMutation({ mutationFn: (input: PublishInput) => sns.publish(topic, input) });
}
