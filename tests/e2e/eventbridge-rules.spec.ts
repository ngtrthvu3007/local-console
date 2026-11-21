import type { Page } from "@playwright/test";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của trang Rules trên UI: tạo rule → Test pattern → thêm target queue → gửi event
// → queue nhận → tắt rule → xóa rule. Resource dọn bằng SDK ở afterAll để test lỗi giữa chừng vẫn sạch.

const rule = uniqueName("rule");
const queue = uniqueName("queue");
const SOURCE = "lc.e2e";

test.describe.configure({ mode: "serial" });

let sqs: SQSClient;
let events: EventBridgeClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  sqs = new SQSClient(viaConsole(region));
  events = new EventBridgeClient(viaConsole(region));
  await sqs.send(new CreateQueueCommand({ QueueName: queue }));
});

test.afterAll(async () => {
  const targets = await events
    .send(new ListTargetsByRuleCommand({ Rule: rule }))
    .then((result) => result.Targets ?? [])
    .catch(() => []);
  if (targets.length)
    await events.send(new RemoveTargetsCommand({ Rule: rule, Ids: targets.map((t) => t.Id!) }));
  await events.send(new DeleteRuleCommand({ Name: rule })).catch(() => {});
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

// Editor là Ace: gõ từng phím bị Ace tự đóng ngoặc nên đặt giá trị qua instance của nó (editor thứ n)
async function setEditor(page: Page, index: number, text: string) {
  await page
    .locator(".ace_editor")
    .nth(index)
    .evaluate((element, value) => {
      (
        element as unknown as { env: { editor: { setValue(text: string): void } } }
      ).env.editor.setValue(value);
    }, text);
}

test("create a rule, reject a bad pattern, test the pattern", async ({ page }) => {
  await page.goto("/eventbridge/rules/create");
  await page.getByLabel("Name", { exact: true }).fill(rule);

  await setEditor(page, 0, "{not json");
  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByText(/Invalid JSON/).first()).toBeVisible();

  await setEditor(page, 0, `{"source": ["${SOURCE}"]}`);
  await page.getByText("Test pattern").click();
  await setEditor(page, 1, `{"source": "${SOURCE}", "detail-type": "OrderCreated", "detail": {}}`);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByText("Match", { exact: true })).toBeVisible();

  await setEditor(page, 1, `{"source": "other", "detail-type": "OrderCreated", "detail": {}}`);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByText("No match", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(flash(page).getByText(`Created rule ${rule}`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/rules/default/${rule}$`));
});

test("add the queue as a target, send an event, the queue receives it", async ({ page }) => {
  await page.goto(`/eventbridge/rules/default/${rule}`);
  await page.getByRole("button", { name: "Add target" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add target" });
  await dialog.getByRole("button", { name: /Type/ }).click();
  await page.getByRole("option", { name: "SQS", exact: true }).click();
  await dialog.getByRole("button", { name: /^SQS/ }).last().click();
  await page.getByRole("option", { name: queue }).click();
  await dialog.getByRole("button", { name: "Add target" }).click();
  await expect(flash(page).getByText("Added target")).toBeVisible();
  await expect(page.getByRole("link", { name: queue })).toBeVisible();

  await page.goto("/eventbridge/buses");
  await page.getByRole("button", { name: "Send events" }).click();
  const send = page.getByRole("dialog", { name: "Send events" });
  await send.getByLabel("Source").fill(SOURCE);
  await send.getByLabel("Detail type").fill("OrderCreated");
  await send.getByRole("button", { name: "Send", exact: true }).click();
  await expect(flash(page).getByText(/^Sent event /)).toBeVisible();

  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  const body = await waitFor("event in the queue", async () => {
    const received = await sqs.send(new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 1 }));
    return received.Messages?.[0]?.Body;
  });
  expect(JSON.parse(body).source).toBe(SOURCE);
});

test("disable then delete the rule", async ({ page }) => {
  await page.goto("/eventbridge/rules");
  await page.getByRole("link", { name: rule }).click();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(flash(page).getByText("Disabled rule")).toBeVisible();
  await expect(page.getByText(/Disabled · bus default/)).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Delete 1 rule/ });
  await dialog.getByPlaceholder("delete").fill("delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(flash(page).getByText("Deleted 1 rule")).toBeVisible();
  await expect(page).toHaveURL(/\/eventbridge\/rules$/);
});
