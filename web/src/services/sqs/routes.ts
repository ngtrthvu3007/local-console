import { sqsRoutes } from "@localconsole/core/sqs";

export const sqsBaseCrumbs = [
  { text: "Amazon SQS", href: sqsRoutes.queues },
  { text: "Queues", href: sqsRoutes.queues },
];

export const queueCrumbs = (queue: string) => [
  ...sqsBaseCrumbs,
  { text: queue, href: sqsRoutes.queue(queue) },
];
