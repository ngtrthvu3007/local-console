import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Luồng nối EventBridge → Lambda (trang Lambda › Triggers hiện rule và schedule từ ListTargetsByRule):
// rule trỏ tới function thì PutEvents chạy function với đúng event, và ARN đích đọc lại được

const functionName = uniqueName("fn");
const ruleName = uniqueName("rule");
const SOURCE = "lc.it.links";
const MARKER = "LC_IT_EVENTBRIDGE_LINK";

const HANDLER_SOURCE = `
export const handler = async (event) => {
  console.log("${MARKER}", event.source, JSON.stringify(event.detail));
  return { ok: true };
};`;

let lambda: LambdaClient;
let logs: CloudWatchLogsClient;
let events: EventBridgeClient;
let functionArn: string;

beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  lambda = new LambdaClient(config);
  logs = new CloudWatchLogsClient(config);
  events = new EventBridgeClient(config);

  functionArn = (
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-lambda`,
        Code: { ZipFile: zipSync({ "index.mjs": strToU8(HANDLER_SOURCE) }) },
        Timeout: 30,
      }),
    )
  ).FunctionArn!;
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    return Configuration?.State === "Active" ? true : undefined;
  });
  await events.send(
    new PutRuleCommand({ Name: ruleName, EventPattern: JSON.stringify({ source: [SOURCE] }) }),
  );
  await events.send(
    new PutTargetsCommand({ Rule: ruleName, Targets: [{ Id: "fn", Arn: functionArn }] }),
  );
});

afterAll(async () => {
  await events.send(new RemoveTargetsCommand({ Rule: ruleName, Ids: ["fn"] })).catch(() => {});
  await events.send(new DeleteRuleCommand({ Name: ruleName })).catch(() => {});
  await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(() => {});
});

describe("rule to Lambda", () => {
  it("reads the function ARN back as the target of the rule", async () => {
    const { Targets } = await events.send(new ListTargetsByRuleCommand({ Rule: ruleName }));
    expect(Targets?.map((target) => target.Arn)).toEqual([functionArn]);
  });

  it("runs the function with the sent event", async () => {
    const result = await events.send(
      new PutEventsCommand({
        Entries: [{ Source: SOURCE, DetailType: "Linked", Detail: JSON.stringify({ order: 7 }) }],
      }),
    );
    expect(result.FailedEntryCount).toBe(0);

    const message = await waitFor("function log with the event", async () => {
      const found = await logs.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${functionName}`,
          filterPattern: MARKER,
        }),
      );
      return found.events?.[0]?.message;
    });
    expect(message).toContain(SOURCE);
    expect(message).toContain('{"order":7}');
  });
});
