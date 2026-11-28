import type { Page } from "@playwright/test";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { ACCOUNT_ID, consoleConfig, viaConsole } from "../it/helpers.ts";
import { choose, expect, flash, setEditor, test, uniqueName } from "./fixtures.ts";

// Luồng chính của Step Functions trên UI: danh sách → state machine → Start execution với input →
// bảng Steps (Parallel, Map, link tới queue) → mở bước để xem input / output → chạy lỗi, xem
// error + cause → Stop execution đang chạy → thêm state machine làm target của rule EventBridge.
// Resource dọn bằng SDK ở afterAll để test lỗi giữa chừng vẫn sạch.

const flow = uniqueName("flow");
const waiter = uniqueName("wait");
const queue = uniqueName("queue");
const rule = uniqueName("rule");

test.describe.configure({ mode: "serial" });

let sfn: SFNClient;
let sqs: SQSClient;
let events: EventBridgeClient;
let region: string;

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  sfn = new SFNClient(viaConsole(region));
  sqs = new SQSClient(viaConsole(region));
  events = new EventBridgeClient(viaConsole(region));
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queue }));
  const roleArn = `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-sfn`;

  await sfn.send(
    new CreateStateMachineCommand({
      name: flow,
      roleArn,
      definition: JSON.stringify({
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
            Parameters: { QueueUrl, "MessageBody.$": "$.msg" },
            ResultPath: null,
            Next: "Par",
          },
          Par: {
            Type: "Parallel",
            ResultPath: null,
            Branches: [
              { StartAt: "First", States: { First: { Type: "Pass", End: true } } },
              { StartAt: "Second", States: { Second: { Type: "Pass", End: true } } },
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
      }),
    }),
  );
  await sfn.send(
    new CreateStateMachineCommand({
      name: waiter,
      roleArn,
      definition: JSON.stringify({
        StartAt: "Pause",
        States: { Pause: { Type: "Wait", Seconds: 25, End: true } },
      }),
    }),
  );
});

test.afterAll(async () => {
  for (const name of [flow, waiter]) {
    await sfn
      .send(
        new DeleteStateMachineCommand({
          stateMachineArn: `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${name}`,
        }),
      )
      .catch(() => {});
  }
  await events
    .send(new RemoveTargetsCommand({ Rule: rule, Ids: ["stepfunctions-" + flow] }))
    .catch(() => {});
  await events.send(new DeleteRuleCommand({ Name: rule })).catch(() => {});
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

async function startExecution(page: Page, input: object) {
  await page.getByRole("button", { name: "Start execution" }).first().click();
  const dialog = page.getByRole("dialog");
  await setEditor(page, JSON.stringify(input));
  await dialog.getByRole("button", { name: "Start execution" }).click();
  await expect(flash(page)).toContainText("Started execution");
}

test("the state machine is listed and opens with its executions and definition", async ({
  page,
}) => {
  await page.goto("/stepfunctions/statemachines");
  await page.getByPlaceholder("Find state machines by name").fill(flow);
  await page.getByRole("link", { name: flow }).click();
  await expect(page.getByRole("heading", { level: 1, name: flow })).toBeVisible();
  await expect(page.getByText("No executions")).toBeVisible();

  await page.getByRole("tab", { name: "Definition" }).click();
  await expect(page.getByText('"StartAt": "Check"')).toBeVisible();
});

test("a run shows every step, nests branches and iterations, and opens a step", async ({
  page,
}) => {
  await page.goto(`/stepfunctions/statemachines/${flow}`);
  await startExecution(page, { n: 5, msg: "from-e2e", items: [1, 2] });

  await expect(page.getByText("Succeeded").first()).toBeVisible();
  for (const step of ["Check", "Send", "Par", "First", "Second", "Each", "Item", "Done"]) {
    await expect(page.getByRole("link", { name: step, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Branch #0")).toBeVisible();
  await expect(page.getByText("Iteration #1")).toBeVisible();
  // Bước Task link sang queue đã gọi
  await expect(page.getByRole("link", { name: queue })).toBeVisible();

  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Input" }).nth(1)).toBeVisible();
  await expect(
    page.getByText('"msg": "hello"').or(page.getByText('"msg": "from-e2e"')).first(),
  ).toBeVisible();
});

test("a failed run shows error and cause, and the failing step", async ({ page }) => {
  await page.goto(`/stepfunctions/statemachines/${flow}`);
  await startExecution(page, { n: 0 });

  await expect(page.getByText("TooSmall").first()).toBeVisible();
  await expect(page.getByText("n must be above 1").first()).toBeVisible();
  await expect(page.getByText("Failed").first()).toBeVisible();

  await page.getByRole("link", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Error" })).toBeVisible();
});

test("the Status filter narrows the executions list", async ({ page }) => {
  await page.goto(`/stepfunctions/statemachines/${flow}`);
  // Chỉ đếm trong bảng: ô lọc cũng hiện chữ "Failed" khi đã chọn
  const rows = page.locator("table");
  // Hai lần chạy ở các test trước: một Succeeded, một Failed
  await expect(rows.getByText("Succeeded", { exact: true })).toHaveCount(1);
  await expect(rows.getByText("Failed", { exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: /Status/ }).click();
  await page.getByRole("option", { name: "Failed" }).click();
  await expect(rows.getByText("Succeeded", { exact: true })).toHaveCount(0);
  await expect(rows.getByText("Failed", { exact: true })).toHaveCount(1);
});

test("a running execution can be stopped", async ({ page }) => {
  await page.goto(`/stepfunctions/statemachines/${waiter}`);
  await startExecution(page, {});

  // exact: thanh trên cùng cũng có chữ "Floci 2.4.0 · Running"
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Stop execution" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop execution" }).click();
  await expect(flash(page)).toContainText("Stopped execution");
  await expect(page.getByText("Aborted").first()).toBeVisible();
  // Đã dừng thì không còn nút Stop
  await expect(page.getByRole("button", { name: "Stop execution" })).toHaveCount(0);
});

test("the state machine can be the target of an EventBridge rule", async ({ page }) => {
  await events.send(
    new PutRuleCommand({ Name: rule, EventPattern: JSON.stringify({ source: ["lc.e2e.sfn"] }) }),
  );
  await page.goto(`/eventbridge/rules/default/${rule}`);
  await page.getByRole("button", { name: "Add target" }).first().click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /Type/, { name: "Step Functions" });
  await choose(page, dialog, /Choose a resource|Step Functions/, { name: flow });
  await dialog.getByRole("button", { name: "Add target" }).click();
  await expect(flash(page)).toContainText("Added target");

  // Target hiện dạng link sang trang state machine
  await page.getByRole("link", { name: flow }).click();
  await expect(page.getByRole("heading", { level: 1, name: flow })).toBeVisible();
});
