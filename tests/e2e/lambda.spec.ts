import { expect, test, uniqueName } from "./fixtures.ts";

const functionName = uniqueName("fn");

test.describe.configure({ mode: "serial" });

test("create a function from the Hello world template", async ({ page }) => {
  await page.goto("/lambda/functions/create");
  await page.getByRole("textbox", { name: "Function name" }).fill(functionName);
  await page.getByRole("button", { name: "Create function" }).click();
  await expect(page).toHaveURL(new RegExp(`/lambda/functions/${functionName}`));
  await expect(page.getByRole("heading", { level: 1, name: functionName })).toBeVisible();
});

test("test the function and see the result", async ({ page }) => {
  await page.goto(`/lambda/functions/${functionName}?tab=test`);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  // Lambda chạy thật trong container: lần đầu khởi động có thể mất vài giây
  await expect(page.getByText(/succeeded/i)).toBeVisible({ timeout: 60_000 });
});

test("delete the function", async ({ page }) => {
  await page.goto("/lambda/functions");
  await page.getByRole("searchbox").fill(functionName);
  await page
    .getByRole("row", { name: new RegExp(functionName) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("textbox");
  if (await confirm.count())
    await confirm.fill((await confirm.getAttribute("placeholder")) ?? "confirm");
  await dialog.getByRole("button", { name: /Delete/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(functionName) })).toHaveCount(0);
});
