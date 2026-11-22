import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "@aws-sdk/client-sfn";
import {
  buildSteps,
  formatElapsed,
  type StepRow,
} from "../../../src/services/stepfunctions/steps.ts";
import { taskResourceOf } from "../../../src/services/stepfunctions/taskResource.ts";

// Event rút gọn từ GetExecutionHistory của Floci 2.4.0 (id, previousEventId, type, chi tiết)
const START = new Date("2026-11-22T10:00:00.000Z").getTime();
const at = (offsetMs: number) => new Date(START + offsetMs);
let nextId = 0;
const event = (
  previousEventId: number,
  type: string,
  details: Partial<HistoryEvent> = {},
  offsetMs = 0,
): HistoryEvent => ({
  id: ++nextId,
  previousEventId,
  type,
  timestamp: at(offsetMs),
  ...details,
});
const entered = (previous: number, name: string, offsetMs = 0, input = "{}") =>
  event(previous, "PassStateEntered", { stateEnteredEventDetails: { name, input } }, offsetMs);
const exited = (previous: number, type: string, name: string, offsetMs = 0, output = "{}") =>
  event(previous, type, { stateExitedEventDetails: { name, output } }, offsetMs);
const history = (...events: HistoryEvent[]) => events;
const reset = () => {
  nextId = 0;
};
const flat = (rows: StepRow[]): StepRow[] => rows.flatMap((row) => [row, ...flat(row.children)]);
const byName = (rows: StepRow[], name: string) => flat(rows).find((row) => row.name === name);

describe("buildSteps", () => {
  it("lists each state once with its type, status, duration and resource", () => {
    reset();
    const events = history(
      event(0, "ExecutionStarted"),
      event(0, "ChoiceStateEntered", { stateEnteredEventDetails: { name: "Check", input: "{}" } }),
      exited(2, "ChoiceStateExited", "Check", 5),
      event(3, "TaskStateEntered", { stateEnteredEventDetails: { name: "Send", input: "{}" } }, 5),
      event(4, "TaskScheduled", {
        taskScheduledEventDetails: {
          resourceType: "sqs",
          resource: "sendMessage",
          parameters: '{"QueueUrl":"http://localhost.floci.io:4566/000000000000/orders"}',
        },
      }),
      event(5, "TaskStarted"),
      event(6, "TaskSucceeded"),
      exited(7, "TaskStateExited", "Send", 1205, '{"MessageId":"1"}'),
      event(8, "ExecutionSucceeded"),
    );
    const rows = buildSteps(events, "SUCCEEDED");
    expect(rows.map((row) => [row.name, row.type, row.status])).toEqual([
      ["Check", "Choice", "succeeded"],
      ["Send", "Task", "succeeded"],
    ]);
    expect(rows[1]?.durationMs).toBe(1200);
    expect(rows[1]?.output).toBe('{"MessageId":"1"}');
    expect(rows[1]?.resource).toEqual({ kind: "sqs", name: "orders" });
  });

  it("marks the state that never exited as Failed, with the execution's error", () => {
    reset();
    const events = history(
      event(0, "ExecutionStarted"),
      entered(0, "Check"),
      exited(2, "PassStateExited", "Check"),
      event(3, "FailStateEntered", { stateEnteredEventDetails: { name: "Boom", input: "{}" } }),
      event(4, "ExecutionFailed", {
        executionFailedEventDetails: { error: "Bad", cause: "n too small" },
      }),
    );
    const rows = buildSteps(events, "FAILED");
    expect(rows.map((row) => row.status)).toEqual(["succeeded", "failed"]);
    expect(rows[1]).toMatchObject({ error: "Bad", cause: "n too small" });
  });

  it("shows Caught error when a Catch moved on after the last attempt failed", () => {
    reset();
    const events = history(
      event(0, "ExecutionStarted"),
      event(0, "TaskStateEntered", { stateEnteredEventDetails: { name: "Try", input: "{}" } }),
      event(2, "TaskScheduled", {
        taskScheduledEventDetails: {
          resourceType: "dynamodb",
          resource: "putItem",
          parameters: '{"TableName":"nope-table"}',
        },
      }),
      event(3, "TaskStarted"),
      event(4, "TaskFailed", {
        taskFailedEventDetails: { error: "DynamoDB.ResourceNotFoundException", cause: "gone" },
      }),
      exited(5, "TaskStateExited", "Try"),
      entered(6, "Handle"),
      exited(7, "PassStateExited", "Handle"),
      event(8, "ExecutionSucceeded"),
    );
    const rows = buildSteps(events, "SUCCEEDED");
    expect(rows[0]).toMatchObject({
      status: "caught",
      error: "DynamoDB.ResourceNotFoundException",
      cause: "gone",
      resource: { kind: "dynamodb", name: "nope-table" },
    });
    expect(rows[1]?.status).toBe("succeeded");
  });

  it("shows Succeeded after Retry when the last attempt worked", () => {
    reset();
    const events = history(
      event(0, "ExecutionStarted"),
      event(0, "TaskStateEntered", { stateEnteredEventDetails: { name: "Call", input: "{}" } }),
      event(2, "LambdaFunctionScheduled", {
        lambdaFunctionScheduledEventDetails: {
          resource: "arn:aws:lambda:ap-southeast-1:000000000000:function:flaky",
        },
      }),
      event(3, "LambdaFunctionStarted"),
      event(4, "LambdaFunctionFailed", {
        lambdaFunctionFailedEventDetails: { error: "Boom", cause: "first try" },
      }),
      event(5, "LambdaFunctionScheduled", {
        lambdaFunctionScheduledEventDetails: {
          resource: "arn:aws:lambda:ap-southeast-1:000000000000:function:flaky",
        },
      }),
      event(6, "LambdaFunctionStarted"),
      event(7, "LambdaFunctionSucceeded"),
      exited(8, "TaskStateExited", "Call"),
    );
    const [row] = buildSteps(events, "RUNNING");
    expect(row).toMatchObject({ status: "succeeded", resource: { kind: "lambda", name: "flaky" } });
    expect(row?.error).toBeUndefined();
  });

  it("nests the states of each Parallel branch under Branch rows", () => {
    reset();
    const events = history(
      event(0, "ExecutionStarted"),
      event(0, "ParallelStateEntered", { stateEnteredEventDetails: { name: "Par", input: "{}" } }),
      event(2, "ParallelStateStarted"),
      entered(3, "B1"),
      exited(4, "PassStateExited", "B1"),
      entered(3, "B2"),
      exited(6, "PassStateExited", "B2"),
      event(7, "ParallelStateSucceeded"),
      exited(7, "ParallelStateExited", "Par"),
      event(9, "ExecutionSucceeded"),
    );
    const rows = buildSteps(events, "SUCCEEDED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.children.map((branch) => branch.name)).toEqual(["Branch #0", "Branch #1"]);
    expect(rows[0]?.children.map((branch) => branch.children.map((step) => step.name))).toEqual([
      ["B1"],
      ["B2"],
    ]);
    expect(flat(rows).every((row) => row.status === "succeeded")).toBe(true);
  });

  it("nests Map states under Iteration rows in index order", () => {
    reset();
    const iteration = (index: number) =>
      event(3, "MapIterationStarted", { mapIterationStartedEventDetails: { name: "Mp", index } });
    const events = history(
      event(0, "ExecutionStarted"),
      event(0, "MapStateEntered", { stateEnteredEventDetails: { name: "Mp", input: "{}" } }),
      event(2, "MapStateStarted"),
      iteration(1),
      iteration(0),
      entered(4, "I", 0, "2"),
      entered(5, "I", 0, "1"),
      exited(7, "PassStateExited", "I", 0, "1"),
      event(8, "MapIterationSucceeded"),
      exited(6, "PassStateExited", "I", 0, "2"),
      event(10, "MapIterationSucceeded"),
      event(11, "MapStateSucceeded"),
      exited(11, "MapStateExited", "Mp"),
      event(13, "ExecutionSucceeded"),
    );
    const [map] = buildSteps(events, "SUCCEEDED");
    expect(map?.children.map((child) => child.name)).toEqual(["Iteration #0", "Iteration #1"]);
    expect(map?.children.map((child) => child.children[0]?.input)).toEqual(["1", "2"]);
    expect(flat([map!]).every((row) => row.status === "succeeded")).toBe(true);
  });

  it("follows the execution status for states that never exited", () => {
    reset();
    const events = history(event(0, "ExecutionStarted"), entered(0, "Wait"));
    expect(byName(buildSteps(events, "RUNNING"), "Wait")?.status).toBe("running");
    expect(byName(buildSteps(events, "ABORTED"), "Wait")?.status).toBe("aborted");
    expect(byName(buildSteps(events, "TIMED_OUT"), "Wait")?.status).toBe("timedOut");
  });
});

describe("taskResourceOf", () => {
  const scheduled = (resourceType: string, resource: string, parameters: object) =>
    event(0, "TaskScheduled", {
      taskScheduledEventDetails: { resourceType, resource, parameters: JSON.stringify(parameters) },
    });

  it("reads the resource name from the resolved parameters", () => {
    expect(
      taskResourceOf(
        scheduled("lambda", "invoke", { FunctionName: "arn:aws:lambda:r:0:function:fn:prod" }),
      ),
    ).toEqual({ kind: "lambda", name: "fn" });
    expect(taskResourceOf(scheduled("lambda", "invoke", { FunctionName: "fn" }))).toEqual({
      kind: "lambda",
      name: "fn",
    });
    expect(
      taskResourceOf(scheduled("sns", "publish", { TopicArn: "arn:aws:sns:r:0:alerts" })),
    ).toEqual({ kind: "sns", name: "alerts" });
    expect(
      taskResourceOf(
        scheduled("states", "startExecution", {
          StateMachineArn: "arn:aws:states:r:0:stateMachine:child",
        }),
      ),
    ).toEqual({ kind: "statemachine", name: "child" });
  });

  it("falls back to text for other integrations or missing parameters", () => {
    expect(taskResourceOf(scheduled("events", "putEvents", {}))).toEqual({
      kind: "other",
      text: "events:putEvents",
    });
    expect(taskResourceOf(scheduled("sqs", "sendMessage", {}))).toEqual({
      kind: "other",
      text: "sqs:sendMessage",
    });
  });

  it("returns nothing for events that don't schedule a task", () => {
    expect(taskResourceOf(event(0, "TaskStarted"))).toBeUndefined();
  });
});

describe("formatElapsed", () => {
  it("picks a readable unit", () => {
    expect(formatElapsed(420)).toBe("420 ms");
    expect(formatElapsed(1200)).toBe("1.2 s");
    expect(formatElapsed(125_000)).toBe("2m 5s");
    expect(formatElapsed()).toBe("—");
  });
});
