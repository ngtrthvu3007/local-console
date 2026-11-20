import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  fifoFields,
  type CodeSample,
} from "@shared/codeSamples.ts";
import type { Queue } from "./queues.ts";

const WAIT_SECONDS = 10;
// SDK v3 mặc định gửi tới host trong queue URL và cảnh báo khi nó khác
// AWS_ENDPOINT_URL; tắt đi để mọi lệnh theo endpoint của môi trường
const QUEUE_URL_NOTE = "Send to AWS_ENDPOINT_URL, not to the queue URL's host";

export function queueSample(queue: Queue): CodeSample {
  const fifo = fifoFields(queue.fifo, queue.settings.contentBasedDedup);
  return {
    node: lines(
      NODE_AWS_NOTE,
      "import {",
      "  SQSClient,",
      "  SendMessageCommand,",
      "  ReceiveMessageCommand,",
      "  DeleteMessageCommand,",
      '} from "@aws-sdk/client-sqs";',
      "",
      `// ${QUEUE_URL_NOTE}`,
      "const sqs = new SQSClient({ useQueueUrlAsEndpoint: false });",
      `const QueueUrl = ${literal(queue.url)};`,
      "",
      "await sqs.send(new SendMessageCommand({",
      "  QueueUrl,",
      '  MessageBody: JSON.stringify({ hello: "world" }),',
      ...fifo.node,
      "}));",
      "",
      "const { Messages = [] } = await sqs.send(",
      `  new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: ${WAIT_SECONDS} }),`,
      ");",
      "for (const message of Messages) {",
      "  console.log(message.Body);",
      "  const ReceiptHandle = message.ReceiptHandle;",
      "  await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle }));",
      "}",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import json",
      ...fifo.pythonImports,
      "import boto3",
      "",
      'sqs = boto3.client("sqs")',
      `queue_url = ${literal(queue.url)}`,
      "",
      "sqs.send_message(",
      "    QueueUrl=queue_url,",
      '    MessageBody=json.dumps({"hello": "world"}),',
      ...fifo.python,
      ")",
      "",
      "response = sqs.receive_message(",
      `    QueueUrl=queue_url, WaitTimeSeconds=${WAIT_SECONDS}`,
      ")",
      'for message in response.get("Messages", []):',
      '    print(message["Body"])',
      "    sqs.delete_message(",
      '        QueueUrl=queue_url, ReceiptHandle=message["ReceiptHandle"]',
      "    )",
    ),
  };
}
