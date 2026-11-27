import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  NotFoundException,
  paginateListTopics,
  PublishCommand,
  type SNSClient,
} from "@aws-sdk/client-sns";
import { collectPages } from "#shared/aws/pagination.ts";
import { isNotFoundError } from "#shared/aws/errors.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { awsManagedAlias } from "#services/kms/keys.ts";
import { ATTRIBUTE_TRUE } from "#services/sqs/constants.ts";
import {
  SNS_KEY_SERVICE,
  type AttributeDataType,
  type TopicType,
} from "#services/sns/constants.ts";
import { toTopic, type Topic } from "#services/sns/topics.ts";

export interface CreateTopicInput {
  name: string;
  type: TopicType;
  contentBasedDedup: boolean;
  encrypted: boolean;
  kmsKeyId: string;
}

export interface PublishInput {
  subject: string;
  body: string;
  attributes: { name: string; type: AttributeDataType; value: string }[];
  groupId: string;
  dedupId: string;
}

export const isTopicMissing = (error: unknown) =>
  error instanceof NotFoundException || isNotFoundError(error);

export async function getTopic(sns: SNSClient, arn: string) {
  const { Attributes = {} } = await sns.send(new GetTopicAttributesCommand({ TopicArn: arn }));
  return toTopic(arn, Attributes);
}

export async function listTopics(sns: SNSClient) {
  const topics = await collectPages(paginateListTopics({ client: sns }, {}), (page) => page.Topics);
  // Local ít topic nên đọc attribute từng topic song song
  return Promise.all(topics.map((topic) => getTopic(sns, topic.TopicArn!)));
}

export const createTopic = (
  sns: SNSClient,
  { name, type, contentBasedDedup, encrypted, kmsKeyId }: CreateTopicInput,
) =>
  sns.send(
    new CreateTopicCommand({
      Name: name,
      Attributes: {
        ...(type === "fifo"
          ? { FifoTopic: ATTRIBUTE_TRUE, ContentBasedDeduplication: String(contentBasedDedup) }
          : {}),
        ...(encrypted ? { KmsMasterKeyId: kmsKeyId || awsManagedAlias(SNS_KEY_SERVICE) } : {}),
      },
    }),
  );

export const deleteTopics = (sns: SNSClient, topics: readonly Topic[]) =>
  runEach(
    topics,
    (topic) => topic.name,
    (topic) => sns.send(new DeleteTopicCommand({ TopicArn: topic.arn })),
  );

export const publish = (
  sns: SNSClient,
  topic: Topic,
  { subject, body, attributes, groupId, dedupId }: PublishInput,
) =>
  sns.send(
    new PublishCommand({
      TopicArn: topic.arn,
      Subject: subject || undefined,
      Message: body,
      MessageAttributes: attributes.length
        ? Object.fromEntries(
            attributes.map(({ name, type, value }) => [
              name,
              { DataType: type, StringValue: value },
            ]),
          )
        : undefined,
      MessageGroupId: topic.fifo ? groupId : undefined,
      MessageDeduplicationId: topic.fifo && dedupId ? dedupId : undefined,
    }),
  );
