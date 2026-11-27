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
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { ATTRIBUTE_TRUE } from "#services/sqs/constants.ts";
import {
  RAW_DELIVERY_PROTOCOLS,
  SUBSCRIPTION_ATTRIBUTES,
  type Protocol,
} from "#services/sns/constants.ts";
import type { FilterPolicyInput } from "#services/sns/filterPolicy.ts";
import { toSubscription, type Subscription } from "#services/sns/topics.ts";

export interface CreateSubscriptionInput extends FilterPolicyInput {
  protocol: Protocol;
  endpoint: string;
  rawDelivery: boolean;
}

// Local ít subscription nên đọc attribute từng cái song song
const describeAll = (sns: SNSClient, listed: ListedSubscription[]) =>
  Promise.all(
    listed.map(async (item) => {
      const { Attributes = {} } = await sns.send(
        new GetSubscriptionAttributesCommand({ SubscriptionArn: item.SubscriptionArn }),
      );

      return toSubscription(item, Attributes);
    }),
  );

export async function listSubscriptions(sns: SNSClient, topicArn: string) {
  const paginator = paginateListSubscriptionsByTopic({ client: sns }, { TopicArn: topicArn });
  return describeAll(sns, await collectPages(paginator, (page) => page.Subscriptions));
}

// SNS không có API theo endpoint: ListSubscriptions rồi lọc theo Endpoint
export async function listSubscriptionsOfEndpoint(
  sns: SNSClient,
  matches: (endpoint: string) => boolean,
) {
  const listed = await collectPages(
    paginateListSubscriptions({ client: sns }, {}),
    (page) => page.Subscriptions,
  );
  return describeAll(
    sns,
    listed.filter(({ Endpoint = "" }) => matches(Endpoint)),
  );
}

export function createSubscription(
  sns: SNSClient,
  topicArn: string,
  input: CreateSubscriptionInput,
) {
  const filterPolicy = input.filterPolicy.trim();

  return sns.send(
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
}

// SNS chỉ nhận từng attribute một, theo thứ tự của object (scope phải đặt trước policy)
export async function setSubscriptionAttributes(
  sns: SNSClient,
  subscription: Subscription,
  attributes: Record<string, string>,
) {
  for (const [name, value] of Object.entries(attributes))
    await sns.send(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscription.arn,
        AttributeName: name,
        AttributeValue: value,
      }),
    );
}

export const deleteSubscriptions = (sns: SNSClient, subscriptions: readonly Subscription[]) =>
  runEach(
    subscriptions,
    (subscription) => subscription.endpoint,
    (subscription) => sns.send(new UnsubscribeCommand({ SubscriptionArn: subscription.arn })),
  );

export const unsubscribe = (sns: SNSClient, subscriptionArn?: string) =>
  sns.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
