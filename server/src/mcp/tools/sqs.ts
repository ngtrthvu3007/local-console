import type { Message } from "@aws-sdk/client-sqs";
import { z } from "zod";
import { ALREADY_TRIGGERED, functionNameOfMapping } from "@localconsole/core/lambda";
import {
  CREATE_QUEUE_DEFAULTS,
  createQueueSchema,
  deadLetterSchema,
  kiBToBytes,
  MAX_RECEIVE_COUNT,
  QUEUE_TABS,
  QUEUE_TRIGGER_DEFAULTS,
  queueSettingsSchema,
  queueTriggerSchema,
  type QueueTab,
  sendMessageSchema,
  SQS_SERVICE_ID,
  sqsRoutes,
} from "@localconsole/core/sqs";
import { APP_DATA_WARNING, LIST_METHOD } from "../constants.ts";
import { formInput, pageShape, requiredUnlessList } from "../input.ts";
import { bulkResult, ok, page, truncateText } from "../result.ts";
import {
  CREATES,
  defineTool,
  DESTROYS,
  READ_ONLY,
  UPDATES,
  type ToolContext,
  type ToolGroup,
} from "../tool.ts";

const queueName = z.string().trim().min(1, "Enter a queue name.").describe("Queue name.");
const byQueue = z.object({ queue: queueName });

const queueUrl = ({ consoleUrl }: ToolContext, name: string, tab?: QueueTab) =>
  consoleUrl(sqsRoutes.queue(name, tab));

// Body dài cắt ở MCP_MAX_TEXT_CHARS, kèm truncated để agent biết mở console xem đủ
const withShortBody = (message: Message) => {
  const { text, truncated } = truncateText(message.Body ?? "");
  return { ...message, Body: text, ...(truncated && { truncated }) };
};

const readQueue = defineTool({
  name: "sqs_read_queue",
  description:
    "Reads SQS queues. method list: every queue with message counts and settings; get: one queue; dlq_sources: queues that use this queue as their dead-letter queue; triggers: Lambda functions triggered by this queue.",
  inputSchema: z
    .object({
      method: z.enum([LIST_METHOD, "get", "dlq_sources", "triggers"]),
      name: z.string().trim().optional().describe("Queue name. Required unless method is list."),
      ...pageShape,
    })
    .superRefine(requiredUnlessList("name")),
  annotations: READ_ONLY,
  handler: async ({ method, name, limit, nextToken }, context) => {
    const { sqs } = context.services;
    if (method === LIST_METHOD)
      return ok(
        page(await sqs.listQueues(), limit, nextToken),
        context.consoleUrl(sqsRoutes.queues),
      );

    const queue = await sqs.getQueue(name!);
    if (method === "get") return ok(queue, queueUrl(context, queue.name));
    if (method === "dlq_sources")
      return ok({ sources: await sqs.listDeadLetterSources(queue) }, queueUrl(context, queue.name));

    return ok(
      { triggers: await sqs.listTriggers(queue) },
      queueUrl(context, queue.name, QUEUE_TABS.triggers),
    );
  },
});

const peekMessage = defineTool({
  name: "sqs_peek_message",
  description: `Lists the messages in an SQS queue, including in-flight ones, without receiving them (visibility and receive count stay the same). Use it to check what an app sent. ${APP_DATA_WARNING}`,
  inputSchema: byQueue.extend(pageShape),
  annotations: READ_ONLY,
  handler: async ({ queue, limit, nextToken }, context) => {
    const { sqs } = context.services;
    const target = await sqs.getQueue(queue);
    const { items, ...rest } = page(await sqs.peekMessages(target), limit, nextToken);

    return ok({ ...rest, items: items.map(withShortBody) }, queueUrl(context, target.name));
  },
});

const createQueue = defineTool({
  name: "sqs_create_queue",
  description:
    "Creates an SQS queue, like Create queue in the console. A FIFO queue name must end with .fifo.",
  inputSchema: formInput(createQueueSchema, CREATE_QUEUE_DEFAULTS, {}),
  annotations: CREATES,
  handler: async (input, context) => {
    await context.services.sqs.createQueue(input);
    return ok(await context.services.sqs.getQueue(input.name), queueUrl(context, input.name));
  },
});

const updateQueue = defineTool({
  name: "sqs_update_queue",
  description:
    "Changes the settings and / or the dead-letter queue of an SQS queue, like Edit settings and Edit dead-letter queue in the console. Settings not sent keep their current value. deadLetter.enabled false turns the dead-letter queue off.",
  inputSchema: z
    .object({
      name: queueName,
      settings: queueSettingsSchema.partial().optional(),
      deadLetter: formInput(
        deadLetterSchema,
        { deadLetterTargetArn: "", maxReceiveCount: String(MAX_RECEIVE_COUNT.default) },
        {},
      )
        .optional()
        .describe("deadLetterTargetArn is the ARN of a queue of the same type."),
    })
    .refine((input) => input.settings || input.deadLetter, "Send settings, deadLetter or both."),
  annotations: UPDATES,
  handler: async ({ name, settings, deadLetter }, context) => {
    const { sqs } = context.services;
    const queue = await sqs.getQueue(name);

    if (settings) {
      const { maxMessageSizeKiB, ...changes } = settings;
      await sqs.updateSettings(queue, {
        ...queue.settings,
        ...changes,
        ...(maxMessageSizeKiB !== undefined && { maxMessageSize: kiBToBytes(maxMessageSizeKiB) }),
      });
    }

    // Như modal của UI: tắt DLQ = không gửi policy
    if (deadLetter)
      await sqs.updateRedrivePolicy(
        queue,
        deadLetter.enabled
          ? {
              deadLetterTargetArn: deadLetter.deadLetterTargetArn,
              maxReceiveCount: Number(deadLetter.maxReceiveCount),
            }
          : undefined,
      );

    return ok(await sqs.getQueue(name), queueUrl(context, name, QUEUE_TABS.settings));
  },
});

const deleteQueue = defineTool({
  name: "sqs_delete_queue",
  description: "Deletes SQS queues and every message in them.",
  inputSchema: z.object({ names: z.array(queueName).min(1) }),
  annotations: DESTROYS,
  handler: async ({ names }, context) => {
    const { sqs } = context.services;
    const queues = await Promise.all(names.map(sqs.getQueue));
    return bulkResult(await sqs.deleteQueues(queues), context.consoleUrl(sqsRoutes.queues));
  },
});

const sendMessage = defineTool({
  name: "sqs_send_message",
  description:
    "Sends a message to an SQS queue, like Send message in the console. A FIFO queue needs groupId, and dedupId unless content-based deduplication is on.",
  inputSchema: byQueue.extend({
    body: z.string(),
    groupId: z.string().default(""),
    dedupId: z.string().default(""),
  }),
  annotations: CREATES,
  handler: async ({ queue, ...message }, context) => {
    const { sqs } = context.services;
    const target = await sqs.getQueue(queue);
    // Luật của form phụ thuộc queue (FIFO, kích thước tối đa) nên kiểm sau khi đọc queue
    const values = sendMessageSchema({
      fifo: target.fifo,
      contentBasedDedup: target.settings.contentBasedDedup,
      maxMessageSize: target.settings.maxMessageSize,
    }).parse(message);
    const { MessageId } = await sqs.sendMessage(target, values);

    return ok({ messageId: MessageId }, queueUrl(context, target.name));
  },
});

const pollMessage = defineTool({
  name: "sqs_poll_message",
  description: `Receives up to 10 messages from an SQS queue as a consumer would (waits up to 5 seconds): they become invisible for the visibility timeout and their receive count goes up. Returns the ReceiptHandle that sqs_delete_message needs. To look without receiving, use sqs_peek_message. ${APP_DATA_WARNING}`,
  inputSchema: byQueue,
  annotations: CREATES,
  handler: async ({ queue }, context) => {
    const { sqs } = context.services;
    const target = await sqs.getQueue(queue);
    const messages = await sqs.pollMessages(target);

    return ok({ messages: messages.map(withShortBody) }, queueUrl(context, target.name));
  },
});

const deleteMessage = defineTool({
  name: "sqs_delete_message",
  description:
    "Deletes messages received with sqs_poll_message (needs their MessageId and ReceiptHandle).",
  inputSchema: byQueue.extend({
    messages: z.array(z.object({ MessageId: z.string(), ReceiptHandle: z.string() })).min(1),
  }),
  annotations: DESTROYS,
  handler: async ({ queue, messages }, context) => {
    const { sqs } = context.services;
    const target = await sqs.getQueue(queue);
    return bulkResult(await sqs.deleteMessages(target, messages), queueUrl(context, target.name));
  },
});

const purgeQueue = defineTool({
  name: "sqs_purge_queue",
  description: "Deletes every message in an SQS queue; the queue stays.",
  inputSchema: z.object({ name: queueName }),
  annotations: DESTROYS,
  handler: async ({ name }, context) => {
    const { sqs } = context.services;
    await sqs.purgeQueue(await sqs.getQueue(name));
    return ok({ purged: name }, queueUrl(context, name));
  },
});

const startRedrive = defineTool({
  name: "sqs_start_redrive",
  description:
    "Moves the messages of a dead-letter queue back to the queues they came from, like Start DLQ redrive in the console.",
  inputSchema: z.object({ name: queueName.describe("Name of the dead-letter queue.") }),
  annotations: CREATES,
  handler: async ({ name }, context) => {
    const { sqs } = context.services;
    const { TaskHandle } = await sqs.startRedrive(await sqs.getQueue(name));
    return ok({ taskHandle: TaskHandle }, queueUrl(context, name));
  },
});

const addTrigger = defineTool({
  name: "sqs_add_trigger",
  description:
    "Makes a Lambda function run when messages arrive in an SQS queue (an event source mapping), like Add trigger in the console.",
  inputSchema: formInput(queueTriggerSchema, QUEUE_TRIGGER_DEFAULTS, { queue: queueName }),
  annotations: CREATES,
  handler: async ({ queue, ...trigger }, context) => {
    const { sqs } = context.services;
    const target = await sqs.getQueue(queue);
    // UI không cho chọn function đã có trigger từ queue này (AWS từ chối, Floci thì nhận thành hai consumer)
    const existing = await sqs.listTriggers(target);
    if (existing.some((mapping) => functionNameOfMapping(mapping) === trigger.functionName))
      throw new Error(`${trigger.functionName}: ${ALREADY_TRIGGERED}.`);
    const { UUID } = await sqs.addTrigger(target, trigger);

    return ok({ uuid: UUID }, queueUrl(context, target.name, QUEUE_TABS.triggers));
  },
});

export const SQS_TOOLS: ToolGroup = {
  id: SQS_SERVICE_ID,
  tools: [
    readQueue,
    peekMessage,
    createQueue,
    updateQueue,
    deleteQueue,
    sendMessage,
    pollMessage,
    deleteMessage,
    purgeQueue,
    startRedrive,
    addTrigger,
  ],
};
