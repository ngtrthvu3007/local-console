import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateEmailIdentityCommand,
  DeleteConfigurationSetCommand,
  DeleteConfigurationSetEventDestinationCommand,
  DeleteEmailIdentityCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityConfigurationSetAttributesCommand,
  SendEmailCommand,
  SESv2Client,
  UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  ACCOUNT_ID,
  AWS_PROXY_URL,
  consoleConfig,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Configuration set của SES gửi event tới SNS topic hoặc event bus (gọi thật qua /aws)

const sender = `${uniqueName("sender")}@example.com`;
const setName = uniqueName("set");
const topicName = uniqueName("mail-events");
const queueName = uniqueName("mail-queue");
const DEFAULT_BUS = "default"; // SES chỉ gửi tới bus default
const ruleName = uniqueName("mail-rule");
const busQueueName = uniqueName("bus-queue");
const SIMULATOR_SUCCESS = "success@simulator.amazonses.com";

let ses: SESv2Client;
let sns: SNSClient;
let sqs: SQSClient;
let events: EventBridgeClient;
let topicArn = "";
let busArn = "";
const queueUrls: Record<string, string> = {};

const sendMail = () =>
  ses.send(
    new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [SIMULATOR_SUCCESS] },
      Content: { Simple: { Subject: { Data: "hello" }, Body: { Text: { Data: "hi" } } } },
    }),
  );

const makeQueue = async (name: string) => {
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
  queueUrls[name] = QueueUrl!;
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }),
  );
  return Attributes!.QueueArn!;
};

const bodies = async (name: string) =>
  (
    (
      await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrls[name],
          WaitTimeSeconds: 1,
          MaxNumberOfMessages: 10,
        }),
      )
    ).Messages ?? []
  ).map((message) => message.Body ?? "");

beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  ses = new SESv2Client(config);
  sns = new SNSClient(config);
  sqs = new SQSClient(config);
  events = new EventBridgeClient(config);

  topicArn = (await sns.send(new CreateTopicCommand({ Name: topicName }))).TopicArn!;
  const queueArn = await makeQueue(queueName);
  await sns.send(new SubscribeCommand({ TopicArn: topicArn, Protocol: "sqs", Endpoint: queueArn }));
  busArn = `arn:aws:events:${region}:${ACCOUNT_ID}:event-bus/${DEFAULT_BUS}`;
  const busQueueArn = await makeQueue(busQueueName);
  await events.send(
    new PutRuleCommand({
      Name: ruleName,
      EventBusName: DEFAULT_BUS,
      EventPattern: JSON.stringify({ source: ["aws.ses"] }),
    }),
  );
  await events.send(
    new PutTargetsCommand({
      Rule: ruleName,
      EventBusName: DEFAULT_BUS,
      Targets: [{ Id: "queue", Arn: busQueueArn }],
    }),
  );
  await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender }));
  await ses.send(new CreateConfigurationSetCommand({ ConfigurationSetName: setName }));
});

afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => {});
  const { messages = [] } = await (await fetch(`${AWS_PROXY_URL}/_aws/ses`)).json();
  for (const mail of messages.filter((item: { Source: string }) => item.Source === sender))
    await fetch(`${AWS_PROXY_URL}/_aws/ses?id=${encodeURIComponent(mail.Id)}`, {
      method: "DELETE",
    });
  await quiet(ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: sender })));
  await quiet(ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: setName })));
  await quiet(
    events.send(
      new RemoveTargetsCommand({ Rule: ruleName, EventBusName: DEFAULT_BUS, Ids: ["queue"] }),
    ),
  );
  await quiet(events.send(new DeleteRuleCommand({ Name: ruleName, EventBusName: DEFAULT_BUS })));
  await quiet(sns.send(new DeleteTopicCommand({ TopicArn: topicArn })));
  for (const QueueUrl of Object.values(queueUrls))
    await quiet(sqs.send(new DeleteQueueCommand({ QueueUrl })));
});

describe("configuration set event destinations", () => {
  it("adds an SNS and a default event bus destination and reads both back", async () => {
    await ses.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: setName,
        EventDestinationName: "to-sns",
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
          SnsDestination: { TopicArn: topicArn },
        },
      }),
    );
    await ses.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: setName,
        EventDestinationName: "to-bus",
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: ["SEND", "DELIVERY"],
          EventBridgeDestination: { EventBusArn: busArn },
        },
      }),
    );
    const { EventDestinations } = await ses.send(
      new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: setName }),
    );
    const byName = Object.fromEntries((EventDestinations ?? []).map((item) => [item.Name, item]));
    expect(byName["to-sns"].SnsDestination?.TopicArn).toBe(topicArn);
    expect(byName["to-bus"].EventBridgeDestination?.EventBusArn).toBe(busArn);
    expect(byName["to-sns"].MatchingEventTypes).toEqual([
      "SEND",
      "DELIVERY",
      "BOUNCE",
      "COMPLAINT",
    ]);
  });

  it("sets and clears the default configuration set of an identity", async () => {
    await ses.send(
      new PutEmailIdentityConfigurationSetAttributesCommand({
        EmailIdentity: sender,
        ConfigurationSetName: setName,
      }),
    );
    expect(
      (await ses.send(new GetEmailIdentityCommand({ EmailIdentity: sender }))).ConfigurationSetName,
    ).toBe(setName);
  });

  it("sends events to the topic and the bus for mail that names no configuration set", async () => {
    await sendMail();
    const topicEvents = await waitFor("event at the SNS queue", async () => {
      const found = await bodies(queueName);
      return found.length ? found.join("\n") : undefined;
    });
    expect(topicEvents).toMatch(/Send|Delivery/i);
    const busEvents = await waitFor("event at the event bus queue", async () => {
      const found = await bodies(busQueueName);
      return found.length ? found.join("\n") : undefined;
    });
    expect(busEvents).toContain("aws.ses");
  });

  it("disables a destination by sending the whole definition again", async () => {
    await ses.send(
      new UpdateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: setName,
        EventDestinationName: "to-sns",
        EventDestination: {
          Enabled: false,
          MatchingEventTypes: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
          SnsDestination: { TopicArn: topicArn },
        },
      }),
    );
    const { EventDestinations } = await ses.send(
      new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: setName }),
    );
    expect(EventDestinations?.find((item) => item.Name === "to-sns")?.Enabled).toBe(false);
  });

  it("removes a destination and clears the identity default", async () => {
    await ses.send(
      new DeleteConfigurationSetEventDestinationCommand({
        ConfigurationSetName: setName,
        EventDestinationName: "to-bus",
      }),
    );
    const { EventDestinations } = await ses.send(
      new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: setName }),
    );
    expect(EventDestinations?.map((item) => item.Name)).toEqual(["to-sns"]);

    await ses.send(
      new PutEmailIdentityConfigurationSetAttributesCommand({ EmailIdentity: sender }),
    );
    expect(
      (await ses.send(new GetEmailIdentityCommand({ EmailIdentity: sender }))).ConfigurationSetName,
    ).toBeUndefined();
  });
});
