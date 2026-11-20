import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Không test xóa: Floci chỉ xóa được cả hộp thư (mọi region), chạy test sẽ làm mất SMS của người khác.
// Số giả có tiền tố +8490000 để tìm lại đúng tin của test
const phone = `+8490000${Math.floor(Math.random() * 10_000)
  .toString()
  .padStart(4, "0")}`;
const message = uniqueName("sms");

test.describe.configure({ mode: "serial" });

test("publish a text message and find it by phone number", async ({ page }) => {
  await page.goto(`/sns/sms?phone=${encodeURIComponent(phone)}`);
  await expect(page.getByPlaceholder("Find by phone number or message")).toHaveValue(phone);

  await page.getByRole("button", { name: "Publish text message" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Phone number" }).fill(phone);
  await dialog.getByRole("textbox", { name: "Message" }).fill(message);
  await dialog.getByRole("button", { name: "Publish" }).click();

  await expect(flash(page).getByText(/^Published text message /)).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(message) })).toBeVisible();
});

test("a phone number without + is rejected before sending", async ({ page }) => {
  await page.goto("/sns/sms");
  await page.getByRole("button", { name: "Publish text message" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Phone number" }).fill("84900000111");
  await dialog.getByRole("textbox", { name: "Message" }).fill("hi");
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(dialog.getByText(/Enter a phone number like/)).toBeVisible();
});
