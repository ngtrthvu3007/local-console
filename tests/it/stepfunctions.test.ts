import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  GetExecutionHistoryCommand,
  ListExecutionsCommand,
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
  type HistoryEvent,
} from "@aws-sdk/client-sfn";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Trang Step Functions của console đọc hết từ API này: DescribeExecution + GetExecutionHistory
// (bảng Steps, link resource), ListExecutions (lọc status), StopExecution. Test giữ nguyên hình
// event mà web/src/services/stepfunctions/steps.ts dựa vào.

const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-sfn`;
const flowName = uniqueName("sfn-flow");
const catchName = uniqueName("sfn-catch");
const waitName = uniqueName("sfn-wait");
const expressName = uniqueName("sfn-express");
const queueName = uniqueName("sfn-queue");
const ruleName = uniqueName("sfn-rule");
const RULE_SOURCE = "lc.it.stepfunctions";

let sfn: SFNClient;
let sqs: SQSClient;
let events: EventBridgeClient;
let region: string;
let queueUrl: string;

const machineArn = (name: string) => `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${name}`;

const create = (name: string, definition: object, type: "STANDARD" | "EXPRESS" = "STANDARD") =>
  sfn.send(
    new CreateStateMachineCommand({
      name,
      definition: JSON.stringify(definition),
      roleArn: ROLE_ARN,
      type,
    }),
  );

async function run(name: string, input: object) {
  const { executionArn } = await sfn.send(
    new StartExecutionCommand({ stateMachineArn: machineArn(name), input: JSON.stringify(input) }),
  );
  const execution = await waitFor("execution to finish", async () => {
    const described = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    return described.status === "RUNNING" ? undefined : described;
  });
  const history = await sfn.send(new GetExecutionHistoryCommand({ executionArn }));
  return { execution, events: history.events ?? [] };
}

const ofType = (history: HistoryEvent[], type: string) =>
  history.filter((event) => event.type === type);

beforeAll(async () => {
  ({ region } = await consoleConfig());
  const config = viaConsole(region);
  sfn = new SFNClient(config);
  sqs = new SQSClient(config);
  events = new EventBridgeClient(config);
  queueUrl = (await sqs.send(new CreateQueueCommand({ QueueName: queueName }))).QueueUrl!;

  await create(flowName, {
    StartAt: "Check",
    States: {
      Check: {
        Type: "Choice",
        Choices: [{ Variable: "$.n", NumericGreaterThan: 1, Next: "Send" }],
        Default: "Reject",
      },
      Send: {
        Type: "Task",
        Resource: "arn:aws:states:::sqs:sendMessage",
        Parameters: { QueueUrl: queueUrl, "MessageBody.$": "$.msg" },
        ResultPath: null,
        Next: "Par",
      },
      Par: {
        Type: "Parallel",
        ResultPath: null,
        Branches: [
          { StartAt: "B1", States: { B1: { Type: "Pass", End: true } } },
          { StartAt: "B2", States: { B2: { Type: "Pass", End: true } } },
        ],
        Next: "Each",
      },
      Each: {
        Type: "Map",
        ItemsPath: "$.items",
        Iterator: { StartAt: "Item", States: { Item: { Type: "Pass", End: true } } },
        Next: "Done",
      },
      Done: { Type: "Succeed" },
      Reject: { Type: "Fail", Error: "TooSmall", Cause: "n must be above 1" },
    },
  });
  await create(catchName, {
    StartAt: "Try",
    States: {
      Try: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:putItem",
        Parameters: { TableName: "lc-it-no-such-table", Item: { id: { S: "1" } } },
        Catch: [{ ErrorEquals: ["States.ALL"], Next: "Handle" }],
        Next: "Done",
      },
      Handle: { Type: "Pass", Next: "Done" },
      Done: { Type: "Succeed" },
    },
  });
  await create(waitName, {
    StartAt: "Pause",
    States: { Pause: { Type: "Wait", Seconds: 25, End: true } },
  });
  await create(
    expressName,
    { StartAt: "Hello", States: { Hello: { Type: "Pass", End: true } } },
    "EXPRESS",
  );
});

afterAll(async () => {
  for (const name of [flowName, catchName, waitName, expressName]) {
    await sfn
      .send(new DeleteStateMachineCommand({ stateMachineArn: machineArn(name) }))
      .catch(() => {});
  }
  await events.send(new RemoveTargetsCommand({ Rule: ruleName, Ids: ["sfn"] })).catch(() => {});
  await events.send(new DeleteRuleCommand({ Name: ruleName })).catch(() => {});
  await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
});

describe("execution history", () => {
  it("shows each state with the resolved task parameters, branches and iterations", async () => {
    const { execution, events: history } = await run(flowName, {
      n: 5,
      msg: "from-it",
      items: [1, 2],
    });
    expect(execution.status).toBe("SUCCEEDED");

    const states = history
      .filter((event) => event.stateEnteredEventDetails)
      .map((event) => event.stateEnteredEventDetails?.name);
    expect(states).toEqual(
      expect.arrayContaining(["Check", "Send", "Par", "B1", "B2", "Each", "Done"]),
    );

    // Bảng Steps lấy tên resource từ tham số đã resolve của TaskScheduled
    const scheduled = ofType(history, "TaskScheduled")[0]?.taskScheduledEventDetails;
    expect(scheduled).toMatchObject({ resourceType: "sqs", resource: "sendMessage" });
    expect(JSON.parse(scheduled?.parameters ?? "{}")).toMatchObject({ MessageBody: "from-it" });
    expect(scheduled?.parameters).toContain(queueName);

    // Parallel: các bước của nhánh nối vào ParallelStateStarted; Map: vào MapIterationStarted
    const parallelStarted = ofType(history, "ParallelStateStarted")[0]!;
    const branchStarts = history.filter(
      (event) =>
        event.previousEventId === parallelStarted.id && event.stateEnteredEventDetails?.name,
    );
    expect(branchStarts.map((event) => event.stateEnteredEventDetails?.name).sort()).toEqual([
      "B1",
      "B2",
    ]);
    const iterations = ofType(history, "MapIterationStarted");
    expect(iterations.map((event) => event.mapIterationStartedEventDetails?.index).sort()).toEqual([
      0, 1,
    ]);

    // Message đã tới queue thật
    const attributes = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["ApproximateNumberOfMessages"],
      }),
    );
    expect(Number(attributes.Attributes?.ApproximateNumberOfMessages)).toBeGreaterThanOrEqual(1);
  });

  it("fails at the Fail state without an exit event, and reports error and cause", async () => {
    const { execution, events: history } = await run(flowName, { n: 0 });
    expect(execution).toMatchObject({
      status: "FAILED",
      error: "TooSmall",
      cause: "n must be above 1",
    });
    expect(ofType(history, "FailStateEntered")).toHaveLength(1);
    expect(history.some((event) => event.type?.endsWith("FailStateExited"))).toBe(false);
    expect(ofType(history, "ExecutionFailed")[0]?.executionFailedEventDetails).toMatchObject({
      error: "TooSmall",
    });
  });

  it("lets a Catch move on: the task fails, the state still exits", async () => {
    const { execution, events: history } = await run(catchName, {});
    expect(execution.status).toBe("SUCCEEDED");
    expect(ofType(history, "TaskFailed")[0]?.taskFailedEventDetails?.error).toMatch(
      /ResourceNotFound/,
    );
    const exitedTry = history.find((event) => event.stateExitedEventDetails?.name === "Try");
    expect(exitedTry).toBeDefined();
  });
});

describe("stopping and listing", () => {
  it("aborts a running execution and finds it by status", async () => {
    const { executionArn } = await sfn.send(
      new StartExecutionCommand({ stateMachineArn: machineArn(waitName), input: "{}" }),
    );
    expect((await sfn.send(new DescribeExecutionCommand({ executionArn }))).status).toBe("RUNNING");

    await sfn.send(new StopExecutionCommand({ executionArn }));
    const stopped = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    expect(stopped.status).toBe("ABORTED");

    const aborted = await sfn.send(
      new ListExecutionsCommand({ stateMachineArn: machineArn(waitName), statusFilter: "ABORTED" }),
    );
    expect(aborted.executions?.map((item) => item.executionArn)).toContain(executionArn);
    const running = await sfn.send(
      new ListExecutionsCommand({ stateMachineArn: machineArn(waitName), statusFilter: "RUNNING" }),
    );
    expect(running.executions?.map((item) => item.executionArn)).not.toContain(executionArn);
  });

  it("can read back an Express execution", async () => {
    const { executionArn } = await sfn.send(
      new StartExecutionCommand({ stateMachineArn: machineArn(expressName), input: "{}" }),
    );
    const execution = await waitFor("express execution to finish", async () => {
      const described = await sfn.send(new DescribeExecutionCommand({ executionArn }));
      return described.status === "RUNNING" ? undefined : described;
    });
    expect(execution.status).toBe("SUCCEEDED");
    // Tên state machine nằm ở vị trí 6 của ARN, cả Standard lẫn Express
    expect(executionArn.split(":")[6]).toBe(expressName);
  });
});

describe("EventBridge rule target", () => {
  it("starts the state machine when an event matches, with no role on the target", async () => {
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventPattern: JSON.stringify({ source: [RULE_SOURCE] }),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: ruleName,
        Targets: [{ Id: "sfn", Arn: machineArn(expressName) }],
      }),
    );
    await events.send(
      new PutEventsCommand({
        Entries: [
          { Source: RULE_SOURCE, DetailType: "Probe", Detail: JSON.stringify({ ok: true }) },
        ],
      }),
    );
    const started = await waitFor("execution started by the rule", async () => {
      const list = await sfn.send(
        new ListExecutionsCommand({ stateMachineArn: machineArn(expressName) }),
      );
      // Một execution đã có từ test Express ở trên; execution của rule là cái thứ hai
      return (list.executions?.length ?? 0) >= 2 ? list.executions : undefined;
    });
    expect(started.length).toBeGreaterThanOrEqual(2);
  });
});
