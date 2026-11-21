import { describe, expect, it } from "vitest";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { listSenders } from "../../../src/services/integrations/senders.ts";

const QUEUE = "arn:aws:sqs:r:0:orders";
const TOPIC = "arn:aws:sns:r:0:alerts";
const FUNCTION = "arn:aws:lambda:r:0:function:target";

// Client giả: paginator đòi đúng instance của SDK, nên mượn prototype rồi thay send theo tên command
const fakeClient = <T extends object>(
  Client: { prototype: T },
  responses: Record<string, (input: never) => object>,
) =>
  Object.assign(Object.create(Client.prototype), {
    send: async (command: { constructor: { name: string }; input: never }) =>
      responses[command.constructor.name](command.input),
  }) as T;

const s3 = fakeClient(S3Client, {
  ListBucketsCommand: () => ({ Buckets: [{ Name: "uploads" }, { Name: "empty" }] }),
  GetBucketNotificationConfigurationCommand: ({ Bucket }: { Bucket: string }) =>
    Bucket === "uploads"
      ? {
          QueueConfigurations: [{ Id: "q", QueueArn: QUEUE, Events: ["s3:ObjectCreated:*"] }],
          TopicConfigurations: [{ Id: "t", TopicArn: TOPIC, Events: ["s3:ObjectRemoved:*"] }],
        }
      : {},
});

const lambda = fakeClient(LambdaClient, {
  ListFunctionsCommand: () => ({ Functions: [{ FunctionName: "a" }, { FunctionName: "b" }] }),
  ListFunctionEventInvokeConfigsCommand: ({ FunctionName }: { FunctionName: string }) => ({
    FunctionEventInvokeConfigs:
      FunctionName === "a"
        ? [
            {
              DestinationConfig: {
                OnSuccess: { Destination: QUEUE },
                OnFailure: { Destination: `${FUNCTION}:prod` },
              },
            },
          ]
        : [],
  }),
  ListEventSourceMappingsCommand: () => ({
    EventSourceMappings: [
      {
        UUID: "u1",
        FunctionArn: "arn:aws:lambda:r:0:function:b",
        DestinationConfig: { OnFailure: { Destination: TOPIC } },
      },
    ],
  }),
});

const ses = fakeClient(SESv2Client, {
  ListConfigurationSetsCommand: () => ({ ConfigurationSets: ["set-a", "set-b"] }),
  GetConfigurationSetEventDestinationsCommand: ({
    ConfigurationSetName,
  }: {
    ConfigurationSetName: string;
  }) => ({
    EventDestinations:
      ConfigurationSetName === "set-a" ? [{ SnsDestination: { TopicArn: TOPIC } }] : [],
  }),
});

const clients = { s3, lambda, ses };
const summary = async (arn: string, kinds: Parameters<typeof listSenders>[2]) =>
  (await listSenders(clients, arn, kinds)).map((sender) => `${sender.type}: ${sender.name}`).sort();

describe("listSenders", () => {
  it("finds what sends to a queue: S3 notification and Lambda async destination", async () => {
    expect(await summary(QUEUE, ["s3", "lambda"])).toEqual([
      "Lambda async: a",
      "S3 notification: uploads",
    ]);
  });

  it("finds what sends to a topic: S3, Lambda trigger on failure, SES", async () => {
    expect(await summary(TOPIC, ["s3", "lambda", "ses"])).toEqual([
      "Lambda trigger: b",
      "S3 notification: uploads",
      "SES configuration set: set-a",
    ]);
  });

  it("matches a function ARN that carries an alias", async () => {
    expect(await summary(FUNCTION, ["lambda"])).toEqual(["Lambda async: a"]);
  });

  it("scans only the kinds asked for", async () => {
    expect(await summary(QUEUE, ["lambda"])).toEqual(["Lambda async: a"]);
    expect(await summary("arn:aws:sqs:r:0:nobody", ["s3", "lambda", "ses"])).toEqual([]);
  });
});
