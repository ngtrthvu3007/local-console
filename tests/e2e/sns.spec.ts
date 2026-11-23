import type { Page } from "@playwright/test";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { DeleteTopicCommand, ListTopicsCommand, SNSClient } from "@aws-sdk/client-sns";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của trang SNS trên UI: tạo topic → subscribe queue có filter → publish có attribute
// → queue chỉ nhận message khớp. Resource dọn bằng SDK ở afterAll để test lỗi giữa chừng vẫn sạch.

const topic = uniqueName("topic");
const fifoTopic = `${uniqueName("fifo")}.fifo`;
const queue = uniqueName("queue");
const MATCHING = "LC_E2E_MATCHING";
const SKIPPED = "LC_E2E_SKIPPED";

test.describe.configure({ mode: "serial" });

// Editor là Ace: gõ vào textarea ẩn của nó (editor thứ n trong modal)
async function typeInEditor(page: Page, index: number, text: string) {
  await page.getByRole("dialog").locator(".ace_text-input").nth(index).focus();
  await page.keyboard.type(text);
}

async function publish(page: Page, body: string, type: string) {
  await page.getByRole("button", { name: "Publish message" }).click();
  const dialog = page.getByRole("dialog");
  await typeInEditor(page, 0, body);
  await dialog.getByRole("button", { name: "Add attribute" }).click();
  await dialog.getByPlaceholder("type", { exact: true }).fill("type");
  await dialog.getByPlaceholder("order", { exact: true }).fill(type);
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    flash(page)
      .getByText(/^Published message /)
      .last(),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
}

test.beforeAll(async () => {
  const sqs = new SQSClient(viaConsole((await consoleConfig()).region));
  await sqs.send(new CreateQueueCommand({ QueueName: queue }));
});

test.afterAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  const sqs = new SQSClient(config);
  const sns = new SNSClient(config);
  const ignore = () => undefined;
  const { Topics = [] } = await sns.send(new ListTopicsCommand({})).catch(() => ({ Topics: [] }));
  for (const { TopicArn } of Topics)
    if (TopicArn?.endsWith(topic) || TopicArn?.endsWith(fifoTopic))
      await sns.send(new DeleteTopicCommand({ TopicArn })).catch(ignore);
  const url = await sqs
    .send(new GetQueueUrlCommand({ QueueName: queue }))
    .then((result) => result.QueueUrl)
    .catch(ignore);
  if (url) await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(ignore);
});

test("create a standard topic", async ({ page }) => {
  await page.goto("/sns/topics/create");
  await page.getByRole("textbox", { name: "Name" }).fill(topic);
  await page.getByRole("button", { name: "Create topic" }).click();
  await expect(page).toHaveURL(new RegExp(`/sns/topics/${topic}`));
  await expect(page.getByRole("heading", { level: 1, name: topic })).toBeVisible();
  await expect(page.getByText("No subscriptions")).toBeVisible();
});

test("subscribe a queue with a filter policy", async ({ page }) => {
  await page.goto(`/sns/topics/${topic}`);
  await page.getByRole("button", { name: "Create subscription" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Queue/ }).click();
  await page.getByRole("option", { name: new RegExp(queue) }).click();
  // Raw: body của message trong queue là chính message; envelope JSON của SNS dài hơn phần bảng peek hiện
  await dialog.getByRole("checkbox", { name: "Raw message delivery" }).check();
  await dialog.getByRole("button", { name: "Filter policy (optional)" }).click();
  await typeInEditor(page, 0, '{"type": ["order"]}');
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(flash(page).getByText("Subscribed Amazon SQS")).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(queue) });
  await expect(row).toContainText("Confirmed");
  await expect(row).toContainText("Yes");
  await expect(row).toContainText("type = order");
});

test("publish with attributes: only the matching message reaches the queue", async ({ page }) => {
  await page.goto(`/sns/topics/${topic}`);
  await publish(page, SKIPPED, "user");
  await publish(page, MATCHING, "order");

  // Tên queue ở cột Endpoint là link sang trang queue; peek thấy đúng message khớp filter
  await page.getByRole("link", { name: queue, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sqs/queues/${queue}$`));
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("row", { name: new RegExp(MATCHING) })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(SKIPPED) })).toHaveCount(0);
});

test("the queue page lists the topic that publishes into it", async ({ page }) => {
  await page.goto(`/sqs/queues/${queue}?tab=settings`);
  await expect(page.getByRole("heading", { name: "SNS subscriptions" })).toBeVisible();
  await page.getByRole("link", { name: topic, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sns/topics/${topic}$`));
});

test("a FIFO topic needs a message group ID before it publishes", async ({ page }) => {
  await page.goto("/sns/topics/create");
  await page.getByRole("radio", { name: /FIFO/ }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(fifoTopic);
  await page.getByRole("button", { name: "Create topic" }).click();
  await expect(page.getByRole("heading", { level: 1, name: fifoTopic })).toBeVisible();

  await page.getByRole("button", { name: "Publish message" }).click();
  const dialog = page.getByRole("dialog");
  await typeInEditor(page, 0, "hello");
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog.getByText("Enter a message group ID.")).toBeVisible();
});

test("delete the topics", async ({ page }) => {
  await page.goto("/sns/topics");
  for (const name of [topic, fifoTopic])
    await page
      .getByRole("row", { name: new RegExp(name) })
      .getByRole("checkbox")
      .check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(flash(page).getByText("Deleted 2 topics")).toBeVisible();
});
