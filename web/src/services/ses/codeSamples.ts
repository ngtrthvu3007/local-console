import { lines } from "@localconsole/core/shared";
import {
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  SAMPLE_TEXT,
  type CodeSample,
} from "@shared/codeSamples.ts";

const SAMPLE_RECIPIENT = "user@example.com";
const SAMPLE_SUBJECT = "Hello";
// Identity kiểu domain: gửi từ một địa chỉ bất kỳ thuộc domain đó
const DOMAIN_SENDER = "noreply";
const MAILBOX_NOTE = "Floci doesn't deliver it: open SES › Mailbox to see it";

export const senderOf = (identity: string) =>
  identity.includes("@") ? identity : `${DOMAIN_SENDER}@${identity}`;

export function identitySample(identity: string): CodeSample {
  const from = literal(senderOf(identity));
  const to = literal(SAMPLE_RECIPIENT);
  const subject = literal(SAMPLE_SUBJECT);
  const body = literal(SAMPLE_TEXT);
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";',
      "",
      "const ses = new SESv2Client({});",
      "const { MessageId } = await ses.send(new SendEmailCommand({",
      `  FromEmailAddress: ${from},`,
      `  Destination: { ToAddresses: [${to}] },`,
      "  Content: {",
      "    Simple: {",
      `      Subject: { Data: ${subject} },`,
      `      Body: { Text: { Data: ${body} } },`,
      "    },",
      "  },",
      "}));",
      "console.log(MessageId);",
      `// ${MAILBOX_NOTE}`,
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'ses = boto3.client("sesv2")',
      "response = ses.send_email(",
      `    FromEmailAddress=${from},`,
      `    Destination={"ToAddresses": [${to}]},`,
      "    Content={",
      '        "Simple": {',
      `            "Subject": {"Data": ${subject}},`,
      `            "Body": {"Text": {"Data": ${body}}},`,
      "        }",
      "    },",
      ")",
      'print(response["MessageId"])',
      `# ${MAILBOX_NOTE}`,
    ),
  };
}
