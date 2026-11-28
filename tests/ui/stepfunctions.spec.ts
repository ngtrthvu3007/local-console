import { join } from "node:path";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, test, uniqueName } from "../e2e/fixtures.ts";

// Các trang chi tiết của Step Functions (cần dữ liệu thật nên không nằm trong responsive.spec.ts)
// trên 4 khung 1440 · 1024 · 768 · 390: không tràn ngang, một h1, control có tên; panel bước trên
// điện thoại; giao diện tối. Chạy ở các project ui-*.

const flow = uniqueName("uiflow");
const express = uniqueName("uiexpress");
const queue = uniqueName("uiqueue");
const COLOR_MODE_KEY = "localconsole:color-mode";
const PHONE_MAX_WIDTH_PX = 688;
const UNNAMED_CONTROL =
  /^\s*- (button|link|checkbox|radio|textbox|combobox|searchbox|switch|tab)( \[[^\]"]*\])*:?$/;

let sfn: SFNClient;
let sqs: SQSClient;
let region: string;
const executionArns: Record<string, string> = {};

const machineArn = (name: string) => `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${name}`;
const executionPath = (arn: string) => `/stepfunctions/execution?arn=${encodeURIComponent(arn)}`;

async function run(machine: string, name: string, input: object) {
  const { executionArn } = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: machineArn(machine),
      name,
      input: JSON.stringify(input),
    }),
  );
  await waitFor(`${name} to finish`, async () =>
    (await sfn.send(new DescribeExecutionCommand({ executionArn }))).status === "RUNNING"
      ? undefined
      : true,
  );
  return executionArn;
}

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  sfn = new SFNClient(viaConsole(region));
  sqs = new SQSClient(viaConsole(region));
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
      name: express,
      roleArn,
      type: "EXPRESS",
      definition: JSON.stringify({ StartAt: "Hi", States: { Hi: { Type: "Pass", End: true } } }),
    }),
  );
  executionArns.ok = await run(flow, "ok-run", { n: 5, msg: "hello", items: [1, 2] });
  executionArns.bad = await run(flow, "bad-run", { n: 0 });
  executionArns.express = await run(express, "express-run", {});
});

test.afterAll(async () => {
  for (const name of [flow, express]) {
    await sfn
      .send(new DeleteStateMachineCommand({ stateMachineArn: machineArn(name) }))
      .catch(() => {});
  }
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

// Hàm, vì ARN của execution chỉ có sau beforeAll
const PAGES: Record<string, () => { path: string; ready: string }> = {
  "machine-executions": () => ({ path: `/stepfunctions/statemachines/${flow}`, ready: "ok-run" }),
  "machine-definition": () => ({
    path: `/stepfunctions/statemachines/${flow}?tab=definition`,
    ready: '"StartAt"',
  }),
  "execution-ok": () => ({ path: executionPath(executionArns.ok!), ready: "Iteration #1" }),
  "execution-failed": () => ({
    path: executionPath(executionArns.bad!),
    ready: "n must be above 1",
  }),
  "execution-express": () => ({ path: executionPath(executionArns.express!), ready: "Succeeded" }),
};

for (const slug of Object.keys(PAGES)) {
  for (const mode of ["light", "dark"] as const) {
    test(`${slug} (${mode}): layout, headings, names`, async ({ page }, testInfo) => {
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key!, value!),
        [COLOR_MODE_KEY, mode],
      );
      const target = PAGES[slug]!();
      await page.goto(target.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText(target.ready, { exact: true }).or(page.getByText(target.ready)).first(),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");

      const dark = await page.evaluate(() => document.body.classList.contains("awsui-dark-mode"));
      expect(dark, `dark mode is ${mode}`).toBe(mode === "dark");

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect.soft(overflow.page, "no horizontal scroll").toBeLessThanOrEqual(overflow.viewport + 1);
      expect.soft(await page.getByRole("heading", { level: 1 }).count(), "exactly one h1").toBe(1);

      const snapshot = await page.locator("body").ariaSnapshot();
      const unnamed = snapshot.split("\n").filter((line) => UNNAMED_CONTROL.test(line));
      expect.soft(unnamed, "every control has an accessible name").toEqual([]);

      await page.screenshot({
        path: join(
          testInfo.project.testDir,
          "..",
          "results",
          "screens",
          testInfo.project.name,
          `stepfunctions-${slug}-${mode}.png`,
        ),
        fullPage: true,
      });
    });
  }
}

test("opening a step shows its panel inside the screen, and closing it works", async ({
  page,
}, testInfo) => {
  await page.goto(executionPath(executionArns.bad!));
  await page.getByRole("link", { name: "Reject", exact: true }).click();
  const panel = page.getByRole("heading", { name: "Reject", level: 2 });
  await expect(panel).toBeVisible();
  await expect(page.getByText("n must be above 1").last()).toBeVisible();

  const viewport = page.viewportSize()!;
  const box = (await panel.boundingBox())!;
  expect(box.x + box.width, "panel title inside the screen").toBeLessThanOrEqual(
    viewport.width + 1,
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal scroll with the panel open").toBeLessThanOrEqual(1);
  if (viewport.width <= PHONE_MAX_WIDTH_PX) {
    // Điện thoại: panel nằm dưới bảng, không phủ cả trang
    expect(box.y, "panel sits below the top bar").toBeGreaterThan(0);
  }
  await page.screenshot({
    path: join(
      testInfo.project.testDir,
      "..",
      "results",
      "screens",
      testInfo.project.name,
      "stepfunctions-step-panel.png",
    ),
    fullPage: true,
  });

  await page.getByRole("button", { name: /close/i }).last().click();
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/step=/);
});

test("the Steps table expands and collapses by keyboard", async ({ page }) => {
  await page.goto(executionPath(executionArns.ok!));
  await expect(page.getByText("Branch #0")).toBeVisible();
  const toggle = page.getByRole("button", { name: /collapse|expand/i }).first();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Branch #0")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Branch #0")).toBeVisible();
});
