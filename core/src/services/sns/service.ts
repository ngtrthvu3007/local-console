import type { SNSClient } from "@aws-sdk/client-sns";
import { clearSms, listSms, publishSms, type PublishSmsInput } from "./operations/sms.ts";
import {
  createSubscription,
  deleteSubscriptions,
  listSubscriptions,
  listSubscriptionsOfEndpoint,
  setSubscriptionAttributes,
  unsubscribe,
  type CreateSubscriptionInput,
} from "./operations/subscriptions.ts";
import {
  createTopic,
  deleteTopics,
  getTopic,
  listTopics,
  publish,
  type CreateTopicInput,
  type PublishInput,
} from "./operations/topics.ts";
import { topicArn, type Subscription, type Topic } from "./topics.ts";

export interface SnsDeps {
  flociUrl: string;
  region: string; // ARN topic ghép từ region + account của Floci
}

export function createSnsService(sns: SNSClient, deps: SnsDeps) {
  return {
    listTopics: () => listTopics(sns),
    getTopic: (name: string) => getTopic(sns, topicArn(deps.region, name)),
    createTopic: (input: CreateTopicInput) => createTopic(sns, input),
    deleteTopics: (topics: readonly Topic[]) => deleteTopics(sns, topics),
    publish: (topic: Topic, input: PublishInput) => publish(sns, topic, input),
    listSubscriptions: (topicArnValue: string) => listSubscriptions(sns, topicArnValue),
    listSubscriptionsOfEndpoint: (matches: (endpoint: string) => boolean) =>
      listSubscriptionsOfEndpoint(sns, matches),
    createSubscription: (topicArnValue: string, input: CreateSubscriptionInput) =>
      createSubscription(sns, topicArnValue, input),
    setSubscriptionAttributes: (subscription: Subscription, attributes: Record<string, string>) =>
      setSubscriptionAttributes(sns, subscription, attributes),
    deleteSubscriptions: (subscriptions: readonly Subscription[]) =>
      deleteSubscriptions(sns, subscriptions),
    unsubscribe: (subscriptionArn?: string) => unsubscribe(sns, subscriptionArn),
    listSms: () => listSms(deps.flociUrl, deps.region),
    clearSms: () => clearSms(deps.flociUrl),
    publishSms: (input: PublishSmsInput) => publishSms(sns, input),
  };
}

export type SnsService = ReturnType<typeof createSnsService>;
