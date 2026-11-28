import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GetSubscriptionAttributesCommand,
  paginateListSubscriptions,
  paginateListSubscriptionsByTopic,
  SetSubscriptionAttributesCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  type SNSClient,
  type Subscription as ListedSubscription,
} from "@aws-sdk/client-sns";
import { runEach } from "@shared/hooks/useNotify.ts";
import { ATTRIBUTE_TRUE } from "../../sqs/constants.ts";
import {
  RAW_DELIVERY_PROTOCOLS,
  SUBSCRIPTION_ATTRIBUTES,
  type FilterScope,
  type Protocol,
} from "../constants.ts";
import { toSubscription, type Subscription } from "../topics.ts";
import { SNS_QUERY_ROOT, topicQueryKey, useInvalidateTopic } from "./useTopics.ts";
import { useSNS } from "./useSNS.ts";

const SUBSCRIPTIONS = "subscriptions";
const ENDPOINT = "endpoint";

// Local ít subscription nên đọc attribute từng cái song song
const describeAll = (client: SNSClient, listed: ListedSubscription[]) =>
  Promise.all(
    listed.map(async (item) => {
      const { Attributes = {} } = await client.send(
        new GetSubscriptionAttributesCommand({ SubscriptionArn: item.SubscriptionArn }),
      );

      return toSubscription(item, Attributes);
    }),
  );

export function useSubscriptions(topicArn: string, topicName: string) {
  const client = useSNS();

  return useQuery({
    queryKey: topicQueryKey(topicName, SUBSCRIPTIONS),
    queryFn: async () => {
      const listed: ListedSubscription[] = [];
      const paginator = paginateListSubscriptionsByTopic({ client }, { TopicArn: topicArn });
      for await (const page of paginator) listed.push(...(page.Subscriptions ?? []));
      return describeAll(client, listed);
    },
  });
}

// SNS không có API theo endpoint: ListSubscriptions rồi lọc theo Endpoint
export async function listSubscriptionsOfEndpoint(
  client: SNSClient,
  matches: (endpoint: string) => boolean,
) {
  const listed: ListedSubscription[] = [];
  for await (const page of paginateListSubscriptions({ client }, {}))
    listed.push(...(page.Subscriptions ?? []).filter(({ Endpoint = "" }) => matches(Endpoint)));
  return describeAll(client, listed);
}

// Các subscription đang đẩy vào một queue / function
export function useSubscriptionsOfEndpoint(endpointArn: string) {
  const client = useSNS();

  return useQuery({
    queryKey: [SNS_QUERY_ROOT, ENDPOINT, endpointArn],
    queryFn: () => listSubscriptionsOfEndpoint(client, (endpoint) => endpoint === endpointArn),
  });
}

// Mọi thay đổi subscription làm mới cả danh sách theo topic lẫn theo endpoint
function useInvalidateSubscriptions() {
  const queryClient = useQueryClient();
  const invalidateTopic = useInvalidateTopic();

  return (topicName: string) =>
    Promise.all([
      invalidateTopic(topicName),
      queryClient.invalidateQueries({ queryKey: [SNS_QUERY_ROOT, ENDPOINT] }),
    ]);
}

interface FilterPolicyInput {
  filterPolicy: string;
  filterScope: FilterScope;
}

interface CreateSubscriptionInput extends FilterPolicyInput {
  protocol: Protocol;
  endpoint: string;
  rawDelivery: boolean;
}

export function useCreateSubscription(topicArn: string, topicName: string) {
  const client = useSNS();
  const invalidate = useInvalidateSubscriptions();

  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => {
      const filterPolicy = input.filterPolicy.trim();

      return client.send(
        new SubscribeCommand({
          TopicArn: topicArn,
          Protocol: input.protocol,
          Endpoint: input.endpoint,
          ReturnSubscriptionArn: true,
          Attributes: {
            ...(RAW_DELIVERY_PROTOCOLS.includes(input.protocol) &&
              input.rawDelivery && { [SUBSCRIPTION_ATTRIBUTES.rawDelivery]: ATTRIBUTE_TRUE }),
            ...(filterPolicy && {
              [SUBSCRIPTION_ATTRIBUTES.filterPolicy]: filterPolicy,
              [SUBSCRIPTION_ATTRIBUTES.filterScope]: input.filterScope,
            }),
          },
        }),
      );
    },
    onSuccess: () => invalidate(topicName),
  });
}

const setAttribute = (client: SNSClient, arn: string, name: string, value: string) =>
  client.send(
    new SetSubscriptionAttributesCommand({
      SubscriptionArn: arn,
      AttributeName: name,
      AttributeValue: value,
    }),
  );

// SNS chỉ nhận từng attribute một, theo thứ tự của object (scope phải đặt trước policy)
export function useSetSubscriptionAttributes(subscription: Subscription, topicName: string) {
  const client = useSNS();
  const invalidate = useInvalidateSubscriptions();

  return useMutation({
    mutationFn: async (attributes: Record<string, string>) => {
      for (const [name, value] of Object.entries(attributes))
        await setAttribute(client, subscription.arn, name, value);
    },
    onSuccess: () => invalidate(topicName),
  });
}

// Policy rỗng = bỏ filter, nên không cần đặt scope
export const filterPolicyAttributes = ({ filterPolicy, filterScope }: FilterPolicyInput) => {
  const policy = filterPolicy.trim();

  return {
    ...(policy && { [SUBSCRIPTION_ATTRIBUTES.filterScope]: filterScope }),
    [SUBSCRIPTION_ATTRIBUTES.filterPolicy]: policy,
  };
};

export function useDeleteSubscriptions(topicName: string) {
  const client = useSNS();
  const invalidate = useInvalidateSubscriptions();

  return useMutation({
    mutationFn: (subscriptions: readonly Subscription[]) =>
      runEach(
        subscriptions,
        (subscription) => subscription.endpoint,
        (subscription) =>
          client.send(new UnsubscribeCommand({ SubscriptionArn: subscription.arn })),
      ),
    onSuccess: () => invalidate(topicName),
  });
}
