import { expect, test, uniqueName } from "./fixtures.ts";

const table = uniqueName("table");

test.describe.configure({ mode: "serial" });

test("create a table with partition and sort key", async ({ page }) => {
  await page.goto("/dynamodb/tables/create");
  await page.getByRole("textbox", { name: "Table name" }).fill(table);
  await page.getByRole("textbox", { name: "Partition key name" }).fill("pk");
  await page.getByRole("textbox", { name: "Sort key name" }).fill("sk");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page).toHaveURL(new RegExp(`/dynamodb/tables/${table}`));
  await expect(page.getByRole("heading", { level: 1, name: table })).toBeVisible();
});

test("create an item from JSON and find it again", async ({ page }) => {
  await page.goto(`/dynamodb/tables/${table}`);
  // Bảng rỗng có thêm một nút Create item trong empty state
  await page.getByRole("button", { name: "Create item" }).first().click();
  const dialog = page.getByRole("dialog");
  // Editor là Ace: gõ vào textarea ẩn của nó sau khi xoá nội dung mẫu
  const editor = dialog.locator(".ace_text-input");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await editor.pressSequentially('{"pk": "user#1", "sk": "order#001", "status": "DONE"}');
  await dialog.getByRole("button", { name: /^(Create|Save)/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: /user#1/ })).toBeVisible();
});

test("delete the table", async ({ page }) => {
  await page.goto("/dynamodb/tables");
  await page.getByRole("searchbox").fill(table);
  await page
    .getByRole("row", { name: new RegExp(table) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("textbox");
  if (await confirm.count())
    await confirm.fill((await confirm.getAttribute("placeholder")) ?? "confirm");
  await dialog.getByRole("button", { name: /Delete/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(table) })).toHaveCount(0);
});
