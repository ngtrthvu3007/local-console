import type { Page } from "@playwright/test";
import { CreateStreamCommand, DeleteStreamCommand, KinesisClient } from "@aws-sdk/client-kinesis";
// Có sẵn qua mọi client AWS SDK (phụ thuộc chung), không khai báo riêng trong package.json
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của Kinesis trên UI: Create (on-demand) → Put record (JSON, tiếng Việt) → Data viewer
// Trim horizon thấy đủ → Next records hết thì khóa → Configuration → Delete.
// Không mở stream không có: Floci trả 400 → console.error (spec 7 #9). Trigger Lambda kiểm ở IT

const stream = uniqueName("kinesis");
const JSON_DATA = '{"event": "click", "page": "/"}';
const JSON_ONE_LINE = '{"event":"click","page":"/"}';
const TEXT_DATA = "Xin chào Việt Nam";

test.describe.configure({ mode: "serial" });

let config: ReturnType<typeof viaConsole>;
// SDK Kinesis trên Node mặc định HTTP/2, proxy /aws của console chỉ nói HTTP/1.1 (gọi thẳng Floci thì được) (spec 7 #13)
const kinesisClient = () => new KinesisClient({ ...config, requestHandler: new NodeHttpHandler() });

test.beforeAll(async () => {
  config = viaConsole((await consoleConfig()).region);
});

test.afterAll(async () => {
  await kinesisClient()
    .send(new DeleteStreamCommand({ StreamName: stream, EnforceConsumerDeletion: true }))
    .catch(() => undefined);
});

const putRecord = async (page: Page, partitionKey: string, data: string) => {
  await page.getByRole("button", { name: "Put record" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Partition key" }).fill(partitionKey);
  // Editor là Ace: gõ vào textarea ẩn của nó
  await dialog.locator(".ace_text-input").focus();
  await page.keyboard.type(data);
  await dialog.getByRole("button", { name: "Put record" }).click();
  await expect(flash(page)).toContainText("Record sent to shardId-");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
};

test("creates an on-demand data stream", async ({ page }) => {
  await page.goto("/kinesis/streams/create");
  await page.getByRole("textbox", { name: "Data stream name" }).fill(stream);
  await page.getByRole("button", { name: "Create data stream" }).click();

  await expect(page).toHaveURL(new RegExp(`/kinesis/streams/${stream}$`));
  await expect(page.getByRole("heading", { level: 1, name: stream })).toBeVisible();
  await expect(page.getByText("On-demand").first()).toBeVisible();
});

test("blocks a stream name AWS would reject", async ({ page }) => {
  await page.goto("/kinesis/streams/create");
  await page.getByRole("textbox", { name: "Data stream name" }).fill("bad name!");
  await page.getByRole("button", { name: "Create data stream" }).click();
  await expect(page.getByText(/Use 1–128 letters/)).toBeVisible();
  await expect(page).toHaveURL(/\/kinesis\/streams\/create$/);
});

test("puts records and reads them back in the Data viewer", async ({ page }) => {
  await page.goto(`/kinesis/streams/${stream}`);
  await putRecord(page, "user-1", JSON_DATA);
  await putRecord(page, "user-2", TEXT_DATA);

  // Trim horizon là vị trí mặc định; shard đầu chọn sẵn
  await expect(page.getByRole("button", { name: /shardId-000000000000/ })).toBeVisible();
  await page.getByRole("button", { name: "Get records" }).click();
  await expect(page.getByRole("row", { name: /user-1/ })).toContainText(JSON_ONE_LINE);
  await expect(page.getByRole("row", { name: /user-2/ })).toContainText(TEXT_DATA);

  // Đổi vị trí mà chưa Get records lại: Next records không được đọc tiếp iterator cũ
  const next = page.getByRole("button", { name: "Next records" });
  await expect(next).toBeEnabled();
  await page.getByRole("button", { name: /Trim horizon/ }).click();
  await page.getByRole("option", { name: "Latest" }).click();
  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: /Latest/ }).click();
  await page.getByRole("option", { name: "Trim horizon" }).click();
  await expect(next).toBeEnabled();

  // Trang sau rỗng: giữ trang đang xem, khóa Next records
  await page.getByRole("button", { name: "Next records" }).click();
  await expect(page.getByRole("button", { name: "Next records" })).toBeDisabled();
  await expect(page.getByRole("row", { name: /user-1/ })).toBeVisible();
});

// Review 2026-11-25: Latest rỗng vẫn đọc tiếp được, record gửi sau đó hiện ở Next records
test("reads records that arrive after a read from Latest", async ({ page }) => {
  await page.goto(`/kinesis/streams/${stream}`);
  await page.getByRole("button", { name: /Trim horizon/ }).click();
  await page.getByRole("option", { name: "Latest" }).click();
  await page.getByRole("button", { name: "Get records" }).click();
  await expect(page.getByText("No records from this position.")).toBeVisible();

  await putRecord(page, "user-3", "sau Latest");
  await page.getByRole("button", { name: "Next records" }).click();
  await expect(page.getByRole("row", { name: /user-3/ })).toContainText("sau Latest");
});

test("shows the configuration and the open shard", async ({ page }) => {
  await page.goto(`/kinesis/streams/${stream}?tab=configuration`);
  await expect(page.getByText(`:stream/${stream}`)).toBeVisible();
  await expect(page.getByRole("row", { name: /shardId-000000000000/ })).toContainText("Open");
});

test("refreshes the Lambda triggers of the stream", async ({ page }) => {
  await page.goto(`/kinesis/streams/${stream}?tab=lambda-triggers`);
  // Một nút của header trang, một nút của bảng trigger
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(2);
});

// Review 2026-11-25: xóa từ trang chi tiết phải báo xong và về danh sách, không kẹt ở "not found"
test("deletes a stream from its detail page", async ({ page }) => {
  const other = uniqueName("kinesis");
  await kinesisClient().send(
    new CreateStreamCommand({ StreamName: other, StreamModeDetails: { StreamMode: "ON_DEMAND" } }),
  );

  await page.goto(`/kinesis/streams/${other}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(flash(page)).toContainText("Deleted");
  await expect(page).toHaveURL(/\/kinesis\/streams$/);
});

test("deletes the stream from the list", async ({ page }) => {
  await page.goto("/kinesis/streams");
  await page.getByRole("searchbox").fill(stream);
  await page
    .getByRole("row", { name: new RegExp(stream) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(page.getByRole("row", { name: new RegExp(stream) })).toHaveCount(0);
});
