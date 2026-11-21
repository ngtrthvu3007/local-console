import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  fifoFields,
  type CodeSample,
} from "@shared/codeSamples.ts";
import type { Topic } from "./topics.ts";

export function topicSample(topic: Topic): CodeSample {
  const fifo = fifoFields(topic.fifo, topic.contentBasedDedup);
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";',
      "",
      "const sns = new SNSClient({});",
      "const { MessageId } = await sns.send(new PublishCommand({",
      `  TopicArn: ${literal(topic.arn)},`,
      '  Message: JSON.stringify({ hello: "world" }),',
      ...fifo.node,
      "}));",
      "console.log(MessageId);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import json",
      ...fifo.pythonImports,
      "import boto3",
      "",
      'sns = boto3.client("sns")',
      "response = sns.publish(",
      `    TopicArn=${literal(topic.arn)},`,
      '    Message=json.dumps({"hello": "world"}),',
      ...fifo.python,
      ")",
      'print(response["MessageId"])',
    ),
  };
}
