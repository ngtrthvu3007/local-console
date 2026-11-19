import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  NotFoundException,
  paginateListTopics,
  PublishCommand,
  type MessageAttributeValue,
  type SNSClient,
} from "@aws-sdk/client-sns";
import { isNotFoundError } from "@shared/aws.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { ATTRIBUTE_TRUE } from "../../sqs/constants.ts";
import type { AttributeDataType, TopicType } from "../constants.ts";
import { toTopic, topicArn, type Topic } from "../topics.ts";
import { useSNS } from "./useSNS.ts";

// Mọi query của SNS nằm dưới key gốc này
export const SNS_QUERY_ROOT = "sns";
export const topicsQueryKey = [SNS_QUERY_ROOT, "topics"];
// Mọi query về một topic (chi tiết, subscription) nằm dưới key này
const anyTopicQueryKey = [SNS_QUERY_ROOT, "topic"];
export const topicQueryKey = (topic: string, part?: string) =>
  part ? [...anyTopicQueryKey, topic, part] : [...anyTopicQueryKey, topic];
const DETAILS = "details";

export const isTopicMissing = (error: unknown) =>
  error instanceof NotFoundException || isNotFoundError(error);

async function describeTopic(client: SNSClient, arn: string) {
  const { Attributes = {} } = await client.send(new GetTopicAttributesCommand({ TopicArn: arn }));
  return toTopic(arn, Attributes);
}

export function useTopics() {
  const client = useSNS();
  return useQuery({
    queryKey: topicsQueryKey,
    queryFn: async () => {
      const arns: string[] = [];
      for await (const page of paginateListTopics({ client }, {}))
        arns.push(...(page.Topics ?? []).map((topic) => topic.TopicArn!));
      // Local ít topic nên đọc attribute từng topic song song
      return Promise.all(arns.map((arn) => describeTopic(client, arn)));
    },
  });
}

// Đường dẫn dùng tên topic; ARN ghép từ region + account của Floci
export function useTopic(name: string) {
  const client = useSNS();
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: topicQueryKey(name, DETAILS),
    queryFn: () => describeTopic(client, topicArn(region, name)),
    retry: false,
  });
}

// Làm mới mọi query của topic và danh sách; trả promise để nút giữ loading tới khi dữ liệu mới về
export function useInvalidateTopic() {
  const queryClient = useQueryClient();
  return (topic: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: topicQueryKey(topic) }),
      queryClient.invalidateQueries({ queryKey: topicsQueryKey }),
    ]);
}

export interface CreateTopicInput {
  name: string;
  type: TopicType;
  contentBasedDedup: boolean;
}

export function useCreateTopic() {
  const client = useSNS();
  const invalidate = useInvalidateTopic();
  return useMutation({
    mutationFn: ({ name, type, contentBasedDedup }: CreateTopicInput) =>
      client.send(
        new CreateTopicCommand({
          Name: name,
          Attributes:
            type === "fifo"
              ? { FifoTopic: ATTRIBUTE_TRUE, ContentBasedDeduplication: String(contentBasedDedup) }
              : undefined,
        }),
      ),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useDeleteTopics() {
  const client = useSNS();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (topics: readonly Topic[]) => {
      const failures: string[] = [];
      for (const topic of topics) {
        try {
          await client.send(new DeleteTopicCommand({ TopicArn: topic.arn }));
        } catch (error) {
          failures.push(`${topic.name}: ${errorMessage(error)}`);
        }
      }
      return { count: topics.length - failures.length, failures };
    },
    // Xóa topic kéo theo subscription của nó, kể cả khối SNS ở trang queue / function
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SNS_QUERY_ROOT] }),
  });
}

export interface PublishInput {
  subject: string;
  body: string;
  attributes: { name: string; type: AttributeDataType; value: string }[];
  groupId: string;
  dedupId: string;
}

export function usePublish(topic: Topic) {
  const client = useSNS();
  return useMutation({
    mutationFn: ({ subject, body, attributes, groupId, dedupId }: PublishInput) => {
      const messageAttributes: Record<string, MessageAttributeValue> = {};
      for (const attribute of attributes)
        messageAttributes[attribute.name] = {
          DataType: attribute.type,
          StringValue: attribute.value,
        };
      return client.send(
        new PublishCommand({
          TopicArn: topic.arn,
          Subject: subject || undefined,
          Message: body,
          MessageAttributes: attributes.length ? messageAttributes : undefined,
          MessageGroupId: topic.fifo ? groupId : undefined,
          MessageDeduplicationId: topic.fifo && dedupId ? dedupId : undefined,
        }),
      );
    },
  });
}
