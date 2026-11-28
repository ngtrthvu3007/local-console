import type { Message, SQSClient } from "@aws-sdk/client-sqs";
import type { QueueTriggerInput } from "#services/lambda/operations/mappings.ts";
import type { LambdaService } from "#services/lambda/service.ts";
import {
  deleteMessages,
  pollMessages,
  purgeQueue,
  sendMessage,
  startRedrive,
  type SendMessageInput,
} from "./operations/messages.ts";
import {
  createQueue,
  deleteQueues,
  getQueue,
  isDeadLetterQueue,
  listDeadLetterSources,
  listQueues,
  updateRedrivePolicy,
  updateSettings,
  type CreateQueueInput,
} from "./operations/queues.ts";
import { peekMessages } from "./peek.ts";
import type { Queue, QueueSettings, RedrivePolicy } from "./queues.ts";

export interface SqsDeps {
  lambda: LambdaService;
  flociUrl: string;
  region: string; // Floci tìm queue theo region trong header của endpoint peek
}

export type AddQueueTriggerInput = Omit<QueueTriggerInput, "queueArn">;

export function createSqsService(sqs: SQSClient, deps: SqsDeps) {
  return {
    listQueues: () => listQueues(sqs),
    getQueue: (name: string) => getQueue(sqs, name),
    listDeadLetterSources: (queue: Queue) => listDeadLetterSources(sqs, queue),
    createQueue: (input: CreateQueueInput) => createQueue(sqs, input),
    deleteQueues: (queues: readonly Queue[]) => deleteQueues(sqs, queues),
    updateSettings: (queue: Queue, settings: QueueSettings) => updateSettings(sqs, queue, settings),
    updateRedrivePolicy: (queue: Queue, policy?: RedrivePolicy) =>
      updateRedrivePolicy(sqs, queue, policy),
    peekMessages: (queue: Queue) => peekMessages(deps.flociUrl, queue.url, deps.region),
    pollMessages: (queue: Queue) => pollMessages(sqs, queue),
    deleteMessages: (queue: Queue, messages: readonly Message[]) =>
      deleteMessages(sqs, queue, messages),
    sendMessage: (queue: Queue, input: SendMessageInput) => sendMessage(sqs, queue, input),
    purgeQueue: (queue: Queue) => purgeQueue(sqs, queue),
    startRedrive: (queue: Queue) => startRedrive(sqs, queue),
    listTriggers: (queue: Queue) => deps.lambda.listMappings({ sourceArn: queue.arn }),
    addTrigger: (queue: Queue, input: AddQueueTriggerInput) =>
      deps.lambda.createQueueTrigger({ ...input, queueArn: queue.arn }),
    listQueueLinks: async (queues: readonly Queue[]) => {
      const checks = await Promise.all(
        queues.map(async (queue) => {
          const [triggered, deadLetter] = await Promise.all([
            deps.lambda.hasMappings(queue.arn),
            isDeadLetterQueue(sqs, queue),
          ]);

          return { name: queue.name, triggered, deadLetter };
        }),
      );

      return {
        withTriggers: checks.filter((check) => check.triggered).map((check) => check.name),
        deadLetterQueues: checks.filter((check) => check.deadLetter).map((check) => check.name),
      };
    },
  };
}

export type SqsService = ReturnType<typeof createSqsService>;
