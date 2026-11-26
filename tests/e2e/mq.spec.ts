import type { Page } from "@playwright/test";
import { amazonMq, consoleConfig } from "../it/helpers.ts";
import { confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của Amazon MQ trên UI: tạo broker → đăng nhập → tạo queue → publish → peek → xóa broker.
// Floci bật một container RabbitMQ thật; console chỉ tới được nó khi chạy trong docker compose
// (development.md › Traps: MQ không tải được ở dev mode trên macOS / Windows)

const broker = uniqueName("broker");
const queue = uniqueName("queue");
const USERNAME = "lce2e";
const PASSWORD = "lc-e2e-password-1"; // MQ đòi mật khẩu từ 12 ký tự
const PAYLOAD = '{"order":"xin chào"}';

test.describe.configure({ mode: "serial" });

let region: string;
let brokerId: string | undefined;

test.beforeAll(async () => {
  region = (await consoleConfig()).region;
});

// Test fail giữa chừng không để lại container RabbitMQ
test.afterAll(async () => {
  if (brokerId) await amazonMq(region, "DELETE", `/v1/brokers/${brokerId}`);
});

// Mật khẩu chỉ giữ trong sessionStorage, mỗi test là context mới: luôn phải đăng nhập
async function signIn(page: Page, timeout?: number) {
  const username = page.getByRole("textbox", { name: "Username" });
  await expect(username).toBeVisible({ timeout });
  await username.fill(USERNAME);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Queues/ })).toBeVisible({ timeout: 60_000 });
}

test("creates a broker and signs in once it is running", async ({ page }) => {
  await page.goto("/mq/brokers/create");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(broker);
  await page.getByRole("textbox", { name: "Username" }).fill(USERNAME);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create broker" }).click();

  await expect(page).toHaveURL(/\/mq\/brokers\/b-/);
  await expect(flash(page)).toContainText(`Creating broker ${broker}`);
  brokerId = page.url().match(/\/mq\/brokers\/([^/?]+)/)?.[1];

  // Lần đầu Floci kéo image RabbitMQ (~270 MB), sau đó RabbitMQ cần vài chục giây để khởi động
  await signIn(page, 180_000);
  // Broker RUNNING trước khi API quản lý trả lời: danh sách queue có thể báo timeout, bấm Retry tới khi tải
  // được (như IT chờ /api/mq trả 200)
  await expect(async () => {
    const retry = page.getByRole("button", { name: "Retry" });
    if (await retry.isVisible()) await retry.click();
    await expect(page.getByText("No queues")).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 120_000 });

  // Log của broker mở thẳng trang CloudWatch Logs (spec Logs 3.8)
  const generalGroup = `/aws/amazonmq/broker/${brokerId}/general`;
  await page.getByRole("tab", { name: "Details" }).click();
  await expect(page.getByRole("link", { name: generalGroup })).toHaveAttribute(
    "href",
    `/logs/groups/detail?${new URLSearchParams({ group: generalGroup })}`,
  );
});

test("creates a queue, publishes to it and peeks the message", async ({ page }) => {
  await page.goto(`/mq/brokers/${brokerId}`);
  await signIn(page);

  await page.getByRole("button", { name: "Create queue" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(queue);
  await dialog.getByRole("button", { name: "Create queue" }).click();
  await expect(dialog).toBeHidden();

  // Chọn queue thì Publish điền sẵn routing key là tên queue (exchange mặc định)
  await page
    .getByRole("row", { name: new RegExp(queue) })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Publish message" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Routing key" })).toHaveValue(queue);
  await dialog.locator(".ace_text-input").fill(PAYLOAD);
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(dialog).toBeHidden();
  await expect(flash(page)).not.toContainText("not routed");

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Peek messages" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("xin chào").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
});

test("deletes the broker from the list", async ({ page }) => {
  await page.goto("/mq/brokers");
  await page
    .getByRole("row", { name: new RegExp(broker) })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));

  await expect(page.getByRole("row", { name: new RegExp(broker) })).toHaveCount(0, {
    timeout: 60_000,
  });
  brokerId = undefined;
});
