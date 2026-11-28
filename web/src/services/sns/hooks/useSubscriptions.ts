import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSubscriptionInput, Subscription } from "@localconsole/core/sns";
import { SNS_QUERY_ROOT, topicQueryKey, useInvalidateTopic } from "./useTopics.ts";
import { useSnsService } from "./useSnsService.ts";

const SUBSCRIPTIONS = "subscriptions";
const ENDPOINT = "endpoint";

export function useSubscriptions(topicArn: string, topicName: string) {
  const sns = useSnsService();

  return useQuery({
    queryKey: topicQueryKey(topicName, SUBSCRIPTIONS),
    queryFn: () => sns.listSubscriptions(topicArn),
  });
}

export function useSubscriptionsOfEndpoint(endpointArn: string) {
  const sns = useSnsService();

  return useQuery({
    queryKey: [SNS_QUERY_ROOT, ENDPOINT, endpointArn],
    queryFn: () => sns.listSubscriptionsOfEndpoint((endpoint) => endpoint === endpointArn),
  });
}

function useInvalidateSubscriptions() {
  const queryClient = useQueryClient();
  const invalidateTopic = useInvalidateTopic();

  return (topicName: string) =>
    Promise.all([
      invalidateTopic(topicName),
      queryClient.invalidateQueries({ queryKey: [SNS_QUERY_ROOT, ENDPOINT] }),
    ]);
}

export function useCreateSubscription(topicArn: string, topicName: string) {
  const sns = useSnsService();
  const invalidate = useInvalidateSubscriptions();

  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => sns.createSubscription(topicArn, input),
    onSuccess: () => invalidate(topicName),
  });
}

export function useSetSubscriptionAttributes(subscription: Subscription, topicName: string) {
  const sns = useSnsService();
  const invalidate = useInvalidateSubscriptions();

  return useMutation({
    mutationFn: (attributes: Record<string, string>) =>
      sns.setSubscriptionAttributes(subscription, attributes),
    onSuccess: () => invalidate(topicName),
  });
}

export function useDeleteSubscriptions(topicName: string) {
  const sns = useSnsService();
  const invalidate = useInvalidateSubscriptions();

  return useMutation({
    mutationFn: (subscriptions: readonly Subscription[]) => sns.deleteSubscriptions(subscriptions),
    onSuccess: () => invalidate(topicName),
  });
}
