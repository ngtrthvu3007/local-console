import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test, uniqueName } from "../e2e/fixtures.ts";

// Đi qua các trạng thái tương tác của component và chụp lại để review UX bằng mắt.
// Ảnh: results/ux/<desktop|phone>-<tên>.png
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const bucket = uniqueName("bucket");
const table = uniqueName("table");
const functionName = uniqueName("fn");

async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  for (const [label, viewport] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300); // Cloudscape đổi layout theo khung sau một nhịp
    await page.screenshot({
      path: join(testInfo.project.testDir, "..", "results", "ux", `${label}-${name}.png`),
      fullPage,
    });
  }
  await page.setViewportSize(DESKTOP);
}

test.describe.configure({ mode: "serial" });

test("S3 components", async ({ page }, testInfo) => {
  // Form báo lỗi
  await page.goto("/s3/buckets/create");
  await page.getByRole("textbox", { name: "Bucket name" }).fill("Bad_Name");
  await page.getByRole("button", { name: "Create bucket" }).click();
  await shot(page, testInfo, "s3-create-validation");

  await page.getByRole("textbox", { name: "Bucket name" }).fill(bucket);
  await page.getByRole("button", { name: "Create bucket" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bucket })).toBeVisible();
  await shot(page, testInfo, "s3-bucket-created-flash");

  // Trang upload: đã chọn file, chưa bấm Upload
  await page.goto(`/s3/buckets/${bucket}/upload`);
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "anh-dai-dien.png", mimeType: "image/png", buffer: Buffer.alloc(2048) },
    { name: "ghi chú rất dài tên file để xem bảng xử lý thế nào khi tên quá dài.txt", mimeType: "text/plain", buffer: Buffer.from("xin chào") },
  ]);
  await shot(page, testInfo, "s3-upload-selected", true);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await shot(page, testInfo, "s3-upload-done", true);
  await page.getByRole("button", { name: "Done" }).click();

  // Bảng object có dữ liệu
  await expect(page.getByRole("link", { name: "anh-dai-dien.png" })).toBeVisible();
  await shot(page, testInfo, "s3-objects-table");

  // Preview text
  await page.getByRole("link", { name: /ghi chú/ }).click();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByText("xin chào")).toBeVisible();
  await shot(page, testInfo, "s3-object-preview");

  // Modal pre-signed URL
  await page.getByRole("button", { name: /pre-signed URL/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, testInfo, "s3-presign-modal");
  await page.keyboard.press("Escape");

  // Modal xoá bucket còn object, rồi xoá thật
  await page.goto("/s3/buckets");
  await page.getByRole("searchbox").fill(bucket);
  await page.getByRole("row", { name: new RegExp(bucket) }).getByRole("radio").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await shot(page, testInfo, "s3-delete-modal");
  await page.getByRole("dialog").getByRole("textbox").fill(bucket);
  await page.getByRole("button", { name: "Empty and delete" }).click();
  await expect(page.getByRole("row", { name: new RegExp(bucket) })).toHaveCount(0);
});

test("DynamoDB components", async ({ page }, testInfo) => {
  await page.goto("/dynamodb/tables/create");
  await page.getByRole("textbox", { name: "Table name" }).fill(table);
  await page.getByRole("textbox", { name: "Partition key name" }).fill("pk");
  await page.getByRole("textbox", { name: "Sort key name" }).fill("sk");
  await page.getByRole("button", { name: "Add index" }).click();
  await shot(page, testInfo, "dynamodb-create-with-index", true);
  await page.getByRole("button", { name: /Remove/ }).first().click().catch(() => undefined);
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByRole("heading", { level: 1, name: table })).toBeVisible();

  // Editor tạo item (bảng rỗng có thêm một nút Create item trong empty state)
  await page.getByRole("button", { name: "Create item" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await shot(page, testInfo, "dynamodb-item-editor");

  // JSON sai: editor báo lỗi thế nào
  const editor = dialog.locator(".ace_text-input");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await editor.pressSequentially('{"pk": "user#1", "sk": ');
  await dialog.getByRole("button", { name: /^(Create|Save)/ }).click();
  await shot(page, testInfo, "dynamodb-item-editor-invalid");

  // Bấm Save làm editor mất focus: focus lại trước khi chọn hết
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await editor.pressSequentially(
    '{"pk": "user#1", "sk": "order#001", "status": "DONE", "total": 12345678901234567890, "tags": ["a", "b"], "address": {"city": "Hà Nội", "zip": "100000"}}',
  );
  await dialog.getByRole("button", { name: /^(Create|Save)/ }).click();
  await expect(dialog).toBeHidden();
  await shot(page, testInfo, "dynamodb-items-table");

  // Panel chi tiết item (split panel) khi chọn một dòng
  await page.getByRole("row", { name: /user#1/ }).getByRole("checkbox").click();
  await shot(page, testInfo, "dynamodb-item-selected");

  // Tab Settings
  await page.getByRole("tab", { name: "Settings" }).click();
  await shot(page, testInfo, "dynamodb-settings", true);

  // Dọn
  await page.goto("/dynamodb/tables");
  await page.getByRole("searchbox").fill(table);
  await page.getByRole("row", { name: new RegExp(table) }).getByRole("checkbox").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await shot(page, testInfo, "dynamodb-delete-modal");
  const confirm = page.getByRole("dialog").getByRole("textbox");
  if (await confirm.count()) await confirm.fill((await confirm.getAttribute("placeholder")) ?? table);
  await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(table) })).toHaveCount(0);
});

test("Lambda components", async ({ page }, testInfo) => {
  await page.goto("/lambda/functions/create");
  await page.getByRole("textbox", { name: "Function name" }).fill(functionName);
  await page.getByRole("button", { name: "Runtime nodejs22.x" }).click();
  await shot(page, testInfo, "lambda-runtime-dropdown");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create function" }).click();
  await expect(page.getByRole("heading", { level: 1, name: functionName })).toBeVisible();
  await shot(page, testInfo, "lambda-code-tab", true);

  await page.getByRole("tab", { name: "Test" }).click();
  await shot(page, testInfo, "lambda-test-tab", true);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByText(/succeeded/i)).toBeVisible({ timeout: 60_000 });
  await shot(page, testInfo, "lambda-test-result", true);

  await page.getByRole("tab", { name: "Triggers" }).click();
  await page.getByRole("button", { name: /Add trigger/ }).click();
  await shot(page, testInfo, "lambda-add-trigger-modal");
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Monitor" }).click();
  await shot(page, testInfo, "lambda-monitor-tab", true);

  // Dọn
  await page.goto("/lambda/functions");
  await page.getByRole("searchbox").fill(functionName);
  await page.getByRole("row", { name: new RegExp(functionName) }).getByRole("checkbox").click();
  await page.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog").getByRole("textbox");
  if (await confirm.count()) await confirm.fill((await confirm.getAttribute("placeholder")) ?? functionName);
  await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(functionName) })).toHaveCount(0);
});
