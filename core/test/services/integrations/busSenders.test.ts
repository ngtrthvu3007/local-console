import { describe, expect, it } from "vitest";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { listBusSenders } from "#services/integrations/operations/busSenders.ts";
import { createLambdaService } from "#services/lambda/service.ts";
import { createLogsService } from "#services/logs/service.ts";
import { createSecretsService } from "#services/secretsmanager/service.ts";
import { createSesService } from "#services/ses/service.ts";

const BUS = "arn:aws:events:r:0:event-bus/default";
const OTHER_BUS = "arn:aws:events:r:0:event-bus/other";

// Client giả: paginator đòi đúng instance của SDK, nên mượn prototype rồi thay send theo tên command
const fakeClient = <T extends object>(
  Client: { prototype: T },
  responses: Record<string, (input: never) => object>,
) =>
  Object.assign(Object.create(Client.prototype), {
    send: async (command: { constructor: { name: string }; input: never }) =>
      responses[command.constructor.name](command.input),
  }) as T;

const lambda = fakeClient(LambdaClient, {
  ListFunctionsCommand: () => ({
    Functions: [{ FunctionName: "b-fn" }, { FunctionName: "a-fn" }, { FunctionName: "idle" }],
  }),
  ListFunctionEventInvokeConfigsCommand: ({ FunctionName }: { FunctionName: string }) => ({
    FunctionEventInvokeConfigs:
      FunctionName === "a-fn"
        ? [
            {
              DestinationConfig: {
                OnSuccess: { Destination: BUS },
                OnFailure: { Destination: BUS },
              },
            },
          ]
        : FunctionName === "b-fn"
          ? [{ DestinationConfig: { OnFailure: { Destination: OTHER_BUS } } }]
          : [],
  }),
});

const ses = fakeClient(SESv2Client, {
  ListConfigurationSetsCommand: () => ({ ConfigurationSets: ["to-bus", "to-sns"] }),
  GetConfigurationSetEventDestinationsCommand: ({
    ConfigurationSetName,
  }: {
    ConfigurationSetName: string;
  }) => ({
    EventDestinations:
      ConfigurationSetName === "to-bus"
        ? [{ EventBridgeDestination: { EventBusArn: BUS } }]
        : [{ SnsDestination: { TopicArn: "arn:aws:sns:r:0:t" } }],
  }),
});

// Facade thật dựng trên client giả; Logs / Secrets không được gọi trong các lượt quét này
const lambdaService = (client: LambdaClient) =>
  createLambdaService(client, {
    logs: createLogsService(new CloudWatchLogsClient({})),
    secrets: createSecretsService(new SecretsManagerClient({})),
    codeUrl: (location) => location,
  });

const services = {
  lambda: lambdaService(lambda),
  ses: createSesService(ses, { flociUrl: "", region: "r" }),
};

const summary = async (busArn: string) =>
  (await listBusSenders(services, busArn)).map(
    (sender) => `${sender.type}: ${sender.name} (${sender.detail})`,
  );

describe("listBusSenders", () => {
  it("finds the functions and configuration sets that send to the bus", async () => {
    expect(await summary(BUS)).toEqual([
      "Lambda function: a-fn (Async success · Async failure)",
      "SES configuration set: to-bus (Mail events)",
    ]);
  });

  it("ignores senders of another bus, and returns nothing when no one sends", async () => {
    expect(await summary(OTHER_BUS)).toEqual(["Lambda function: b-fn (Async failure)"]);
    expect(await summary("arn:aws:events:r:0:event-bus/none")).toEqual([]);
  });
});
