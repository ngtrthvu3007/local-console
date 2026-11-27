import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "@aws-sdk/client-sfn";
import { buildSteps, type StepRow } from "#services/stepfunctions/steps.ts";
import distmap from "./fixtures/distmap.json" with { type: "json" };
import loop from "./fixtures/loop.json" with { type: "json" };
import mapfail from "./fixtures/mapfail.json" with { type: "json" };
import mapparallel from "./fixtures/mapparallel.json" with { type: "json" };
import nested from "./fixtures/nested.json" with { type: "json" };
import retry from "./fixtures/retry.json" with { type: "json" };
import sync from "./fixtures/sync.json" with { type: "json" };

// History thật của Floci 2.4.0 (GetExecutionHistory, ngày 2026-11-22), mỗi file một dạng workflow.
// Ghi lại bằng: tạo state machine, StartExecution, lưu `events` và status.
interface Fixture {
  status: string;
  events: unknown[];
}

const dump = (rows: StepRow[], depth = 0): string[] =>
  rows.flatMap((row) => [
    `${"  ".repeat(depth)}${row.name} ${row.status}${row.error ? ` (${row.error})` : ""}`,
    ...dump(row.children, depth + 1),
  ]);

// JSON có timestamp dạng chuỗi; SDK trả Date
const eventsOf = (events: readonly unknown[]) =>
  events.map((event) => ({
    ...(event as HistoryEvent),
    timestamp: new Date((event as { timestamp: string }).timestamp),
  }));

const tree = ({ status, events }: Fixture) => dump(buildSteps(eventsOf(events), status));

describe("buildSteps on real Floci histories", () => {
  it("nests a Map inside a Parallel branch", () => {
    expect(tree(nested)).toEqual([
      "Par succeeded",
      "  Branch #0 succeeded",
      "    M succeeded",
      "      Iteration #0 succeeded",
      "        In succeeded",
      "      Iteration #1 succeeded",
      "        In succeeded",
      "  Branch #1 succeeded",
      "    Solo succeeded",
    ]);
  });

  it("nests a Parallel inside each Map iteration", () => {
    const lines = tree(mapparallel);
    expect(lines).toHaveLength(13);
    expect(lines.slice(0, 6)).toEqual([
      "M succeeded",
      "  Iteration #0 succeeded",
      "    Par succeeded",
      "      Branch #0 succeeded",
      "        A succeeded",
      "      Branch #1 succeeded",
    ]);
    expect(lines.filter((line) => line.includes("Iteration"))).toHaveLength(2);
  });

  it("lists every visit of a state that a Choice loops back to", () => {
    expect(tree(loop).map((line) => line.split(" ")[0])).toEqual([
      "Init",
      "Check",
      "Inc",
      "Check",
      "Inc",
      "Check",
      "Done",
    ]);
  });

  it("gives a failed iteration the error of its failing step", () => {
    expect(tree(mapfail)).toEqual([
      "M failed (ItemBad)",
      "  Iteration #0 failed (ItemBad)",
      "    Boom failed (ItemBad)",
      "  Iteration #1 failed (ItemBad)",
      "    Boom failed (ItemBad)",
    ]);
  });

  it("shows Caught error after the last of several Retry attempts failed", () => {
    expect(tree(retry)).toEqual([
      "Send caught (SQS.AWS.SimpleQueueService.NonExistentQueue)",
      "Fallback succeeded",
    ]);
  });

  it("links a .sync nested execution to the child state machine", () => {
    const [row] = buildSteps(eventsOf(sync.events), sync.status);
    expect(row).toMatchObject({
      status: "succeeded",
      resource: { kind: "statemachine", name: "lc-fx-child" },
    });
  });

  it("shows a Distributed Map as a single row, since Floci emits no iteration events", () => {
    expect(tree(distmap)).toEqual(["M succeeded"]);
  });
});
