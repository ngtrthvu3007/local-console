import { expect, test, uniqueName } from "./fixtures.ts";

const queue = uniqueName("queue");

test.describe.configure({ mode: "serial" });

test("create a standard queue", async ({ page }) => {
  await page.goto("/sqs/queues/create");
  await page.getByRole("textbox", { name: "Name" }).fill(queue);
  await page.getByRole("button", { name: "Create queue" }).click();
  await expect(page).toHaveURL(new RegExp(`/sqs/queues/${queue}`));
  await expect(page.getByRole("heading", { level: 1, name: queue })).toBeVisible();
});

test("send a message and peek it without consuming", async ({ page }) => {
  await page.goto(`/sqs/queues/${queue}`);
  await page.getByRole("button", { name: "Send message" }).click();
  const dialog = page.getByRole("dialog");
  // Editor là Ace: gõ vào textarea ẩn của nó
  await dialog.locator(".ace_text-input").focus();
  await page.keyboard.type('{"orderId": 42}');
  await dialog.getByRole("button", { name: "Send" }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("row", { name: /orderId/ })).toBeVisible();
});

test("poll the message and delete it", async ({ page }) => {
  await page.goto(`/sqs/queues/${queue}`);
  await page.getByRole("button", { name: "Poll for messages" }).click();
  const dialog = page.getByRole("dialog");
  const row = dialog.getByRole("row", { name: /orderId/ });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
});

test("delete the queue", async ({ page }) => {
  await page.goto("/sqs/queues");
  await page.getByRole("searchbox").fill(queue);
  await page
    .getByRole("row", { name: new RegExp(queue) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row", { name: new RegExp(queue) })).toHaveCount(0);
});
