import type { HistoryEvent } from "@aws-sdk/client-sfn";
import { MILLISECONDS_PER_SECOND, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDuration } from "@shared/format.ts";
import { STEP_STATUS_OF_EXECUTION, type StepStatus } from "./constants.ts";
import { taskResourceOf, type TaskResource } from "./taskResource.ts";

export interface StepRow {
  id: string;
  name: string;
  // Task, Choice, Pass…; "Iteration" / "Branch" là dòng gom của Map / Parallel
  type: string;
  status: StepStatus;
  startedAt?: Date;
  durationMs?: number;
  resource?: TaskResource;
  input?: string;
  output?: string;
  // AWS cắt payload quá lớn: input / output ở đây chỉ là phần đầu
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  error?: string;
  cause?: string;
  // Dòng gom (Iteration, Branch) không có input / output riêng để mở panel
  openable: boolean;
  children: StepRow[];
}

const ITERATION_TYPE = "Iteration";
const BRANCH_TYPE = "Branch";
const FAIL_STATE_TYPE = "Fail";
// Dưới mức này hiện giây lẻ ("1.2 s"), từ đây hiện "2m 5s"
const SECONDS_ONLY_LIMIT_MS = 10 * MILLISECONDS_PER_SECOND;

const ENTERED_EVENT = /^(.+)StateEntered$/;
const EXITED_EVENT = /^(.+)StateExited$/;
const ITERATION_SETTLED_EVENTS = new Set([
  "MapIterationSucceeded",
  "MapIterationFailed",
  "MapIterationAborted",
]);
const TASK_SUCCESS_EVENTS = new Set([
  "TaskSucceeded",
  "LambdaFunctionSucceeded",
  "ActivitySucceeded",
]);

interface Failure {
  error?: string;
  cause?: string;
}

// Một lần thử của bước Task bị lỗi. Retry sinh nhiều lần; lần cuối quyết định bước là Succeeded
// hay Caught error
const taskFailureOf = (event: HistoryEvent): Failure | undefined =>
  event.taskFailedEventDetails ??
  event.taskTimedOutEventDetails ??
  event.taskSubmitFailedEventDetails ??
  event.lambdaFunctionFailedEventDetails ??
  event.lambdaFunctionTimedOutEventDetails ??
  event.activityFailedEventDetails;

// Dòng đang dựng. Dòng gom (nhánh, vòng lặp) không có event riêng cho tên, nên sinh ra từ event con
interface Node {
  row: StepRow;
  parent?: Node;
  kids: Node[];
  isState: boolean;
  enteredAt?: Date;
  exited: boolean;
  settled: boolean;
  failure?: Failure;
  branches: number; // số nhánh Parallel đã thấy
  order: number; // chỉ số vòng lặp Map; Floci phát vòng lặp không theo thứ tự
}

// Vị trí của một event trong cây: nằm trong dòng gom nào (`parent`), đang ở bước nào (`current`).
// `branchesOf` / `iterationsOf`: event ngay trước nhánh / vòng lặp đầu tiên của Parallel / Map
interface Context {
  parent?: Node;
  current?: Node;
  branchesOf?: Node;
  iterationsOf?: Node;
}

const ROOT_CONTEXT: Context = {};

function newNode(
  row: Pick<StepRow, "id" | "name" | "type" | "openable"> & Partial<StepRow>,
  parent: Node | undefined,
  isState: boolean,
): Node {
  const node: Node = {
    row: { status: "running", children: [], ...row },
    parent,
    kids: [],
    isState,
    exited: false,
    settled: false,
    branches: 0,
    order: 0,
  };
  parent?.kids.push(node);
  return node;
}

// Bước vừa thoát: thường là bước hiện tại của event trước. Với Parallel / Map thì event trước nằm
// trong nhánh / vòng lặp, nên đi ngược lên các dòng gom
function openStateNamed(context: Context, name?: string): Node | undefined {
  for (let node = context.current ?? context.parent; node; node = node.parent) {
    if (node.isState && !node.exited && node.row.name === name) return node;
  }
  return undefined;
}

// Gom GetExecutionHistory thành cây dòng cho bảng Steps (spec 3.4). `executionStatus` cho biết
// bước chưa thoát là đang chạy hay đã dừng cùng execution
export function buildSteps(events: readonly HistoryEvent[], executionStatus: string): StepRow[] {
  const contexts = new Map<number, Context>();
  const nodes: Node[] = [];
  const states: Node[] = [];
  let executionFailure: Failure | undefined;

  for (const event of events) {
    const previous = contexts.get(event.previousEventId ?? 0) ?? ROOT_CONTEXT;
    let context = previous;
    const type = event.type ?? "";
    const entered = ENTERED_EVENT.exec(type);
    const exited = EXITED_EVENT.exec(type);

    if (entered) {
      const details = event.stateEnteredEventDetails;
      let parent = previous.parent;
      if (previous.branchesOf) {
        const split = previous.branchesOf;
        parent = newNode(
          {
            id: `branch-${split.row.id}-${split.branches}`,
            name: `${BRANCH_TYPE} #${split.branches}`,
            type: BRANCH_TYPE,
            openable: false,
          },
          split,
          false,
        );
        split.branches += 1;
        nodes.push(parent);
      }
      const node = newNode(
        {
          id: String(event.id),
          name: details?.name ?? type,
          type: entered[1] ?? type,
          startedAt: event.timestamp,
          input: details?.input,
          inputTruncated: details?.inputDetails?.truncated,
          openable: true,
        },
        parent,
        true,
      );
      node.enteredAt = event.timestamp;
      nodes.push(node);
      states.push(node);
      context = { parent, current: node };
    } else if (exited) {
      const details = event.stateExitedEventDetails;
      const node = openStateNamed(previous, details?.name);
      if (node) {
        node.exited = true;
        node.row.output = details?.output;
        node.row.outputTruncated = details?.outputDetails?.truncated;
        if (node.enteredAt && event.timestamp) {
          node.row.durationMs = event.timestamp.getTime() - node.enteredAt.getTime();
        }
      }
      context = { parent: node?.parent };
    } else if (type === "ParallelStateStarted") {
      context = { ...previous, branchesOf: previous.current };
    } else if (type === "MapStateStarted") {
      context = { ...previous, iterationsOf: previous.current };
    } else if (type === "MapIterationStarted" && previous.iterationsOf) {
      const index = event.mapIterationStartedEventDetails?.index ?? 0;
      const iteration = newNode(
        {
          id: String(event.id),
          name: `${ITERATION_TYPE} #${index}`,
          type: ITERATION_TYPE,
          openable: false,
        },
        previous.iterationsOf,
        false,
      );
      iteration.order = index;
      nodes.push(iteration);
      context = { parent: iteration };
    } else if (ITERATION_SETTLED_EVENTS.has(type)) {
      const iteration = previous.parent;
      if (iteration) {
        iteration.settled = true;
        // Event vòng lặp không mang error / cause, chỉ cho biết vòng lặp có lỗi hay không
        iteration.failure = type === "MapIterationSucceeded" ? undefined : {};
      }
    } else if (event.taskScheduledEventDetails || event.lambdaFunctionScheduledEventDetails) {
      if (previous.current) previous.current.row.resource = taskResourceOf(event);
    } else if (TASK_SUCCESS_EVENTS.has(type)) {
      if (previous.current) previous.current.failure = undefined;
    } else if (taskFailureOf(event)) {
      if (previous.current) previous.current.failure = taskFailureOf(event);
    } else if (event.executionFailedEventDetails ?? event.executionTimedOutEventDetails) {
      executionFailure = event.executionFailedEventDetails ?? event.executionTimedOutEventDetails;
    }

    if (event.id !== undefined) contexts.set(event.id, context);
  }

  // Lỗi của execution thuộc bước chưa thoát vào sau cùng (vd: Map không có mảng) và mọi Fail state
  // chưa thoát (event FailStateEntered không mang error / cause, mà Fail state là nguyên nhân lỗi)
  if (executionFailure) {
    const open = states.filter((node) => !node.exited && !node.failure);
    const stalled = open[open.length - 1];
    for (const node of open) {
      if (node === stalled || node.row.type === FAIL_STATE_TYPE) node.failure = executionFailure;
    }
  }

  // Con trước cha: nhánh Parallel xong khi mọi bước trong nó xong
  for (const node of [...nodes].reverse()) {
    node.kids.sort((a, b) => a.order - b.order);
    node.row.children = node.kids.map((kid) => kid.row);
    if (node.isState) node.settled = node.exited;
    else if (node.row.type === BRANCH_TYPE) {
      node.settled = node.kids.length > 0 && node.kids.every((kid) => kid.settled);
    }
    // Event vòng lặp / nhánh không mang error, và dòng gom dừng giữa chừng cũng vậy: lấy của bước
    // con lỗi đầu tiên
    const failedWithoutReason = !node.isState && node.failure && !node.failure.error;
    const stoppedContainer =
      !node.settled && !node.failure && node.kids.length > 0 && executionStatus !== "RUNNING";
    if (failedWithoutReason || stoppedContainer) {
      const failedKid = node.kids.find((kid) => kid.row.error);
      if (failedKid) node.failure = { error: failedKid.row.error, cause: failedKid.row.cause };
    }
    node.row.error = node.failure?.error;
    node.row.cause = node.failure?.cause;
    if (!node.settled) node.row.status = STEP_STATUS_OF_EXECUTION[executionStatus] ?? "running";
    else if (!node.failure) node.row.status = "succeeded";
    else node.row.status = node.isState ? "caught" : "failed";
  }
  return nodes.filter((node) => !node.parent).map((node) => node.row);
}

// "420 ms", "1.2 s", "2m 5s"
export function formatElapsed(milliseconds?: number): string {
  if (milliseconds === undefined) return NOT_AVAILABLE;
  if (milliseconds < MILLISECONDS_PER_SECOND) return `${milliseconds} ms`;
  if (milliseconds < SECONDS_ONLY_LIMIT_MS) {
    return `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
  }
  return formatDuration(Math.round(milliseconds / MILLISECONDS_PER_SECOND));
}
