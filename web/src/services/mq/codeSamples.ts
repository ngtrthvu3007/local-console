import {
  lines,
  literal,
  SAMPLE_TEXT,
  type CodeSample,
} from "@shared/codeSamples.ts";

const SAMPLE_QUEUE = "hello";
// Floci không trả user của broker (đã kiểm 2026-11-20), mật khẩu thì không API
// nào trả: để chỗ trống rõ ràng cho dev điền
const USER_PLACEHOLDER = "USER";
const PASSWORD_PLACEHOLDER = "PASSWORD";
const URL_VARIABLE = "AMQP_URL";
const URL_NOTE =
  `Replace ${USER_PLACEHOLDER}:${PASSWORD_PLACEHOLDER} with the broker user ` +
  `you created, or set ${URL_VARIABLE}`;

// AMQP endpoint của Floci (amqp://host:port) thêm chỗ điền user / mật khẩu
export function brokerUrl(endpoint: string) {
  const url = new URL(endpoint);
  url.username = USER_PLACEHOLDER;
  url.password = PASSWORD_PLACEHOLDER;
  return url.toString();
}

// Broker không đi qua AWS SDK: app nối thẳng bằng client AMQP
export const brokerSample = (url: string): CodeSample => ({
  node: lines(
    'import amqp from "amqplib";',
    "",
    `// ${URL_NOTE}`,
    `const url = process.env.${URL_VARIABLE} ?? ${literal(url)};`,
    "const connection = await amqp.connect(url);",
    "const channel = await connection.createChannel();",
    `const queue = ${literal(SAMPLE_QUEUE)};`,
    "",
    "await channel.assertQueue(queue);",
    `channel.sendToQueue(queue, Buffer.from(${literal(SAMPLE_TEXT)}));`,
    "const message = await channel.get(queue, { noAck: true });",
    "console.log(message && message.content.toString());",
    "await connection.close();",
  ),
  python: lines(
    "import os",
    "import pika",
    "",
    `# ${URL_NOTE}`,
    `url = os.environ.get(${literal(URL_VARIABLE)}, ${literal(url)})`,
    "connection = pika.BlockingConnection(pika.URLParameters(url))",
    "channel = connection.channel()",
    `queue = ${literal(SAMPLE_QUEUE)}`,
    "",
    "channel.queue_declare(queue=queue)",
    `body = ${literal(SAMPLE_TEXT)}`,
    'channel.basic_publish(exchange="", routing_key=queue, body=body)',
    "_, _, body = channel.basic_get(queue=queue, auto_ack=True)",
    "print(body)",
    "connection.close()",
  ),
});
