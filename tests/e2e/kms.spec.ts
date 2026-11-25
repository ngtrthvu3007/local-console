import type { Page } from "@playwright/test";
import {
  CreateKeyCommand,
  DeleteAliasCommand,
  KMSClient,
  ListAliasesCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của KMS trên UI: tạo key + alias → mở bằng alias → Try it mã hóa / giải mã → tắt / bật →
// lên lịch xóa / hủy; key ECC ký rồi xác minh. Không cố tình gây lỗi KMS: trình duyệt sẽ ghi
// console.error (lỗi key tắt, chữ ký sai… kiểm ở IT)

const aliasName = `alias/${uniqueName("kms")}`;
const MIN_PENDING_DAYS = 7;

test.describe.configure({ mode: "serial" });

let kms: KMSClient;
const keyIds: string[] = [];

test.beforeAll(async () => {
  kms = new KMSClient(viaConsole((await consoleConfig()).region));
});

test.afterAll(async () => {
  const { Aliases = [] } = await kms.send(new ListAliasesCommand({}));
  const ours = Aliases.find((alias) => alias.AliasName === aliasName);
  if (ours?.TargetKeyId) keyIds.push(ours.TargetKeyId);
  await kms.send(new DeleteAliasCommand({ AliasName: aliasName })).catch(() => undefined);
  for (const KeyId of keyIds) {
    await kms
      .send(new ScheduleKeyDeletionCommand({ KeyId, PendingWindowInDays: MIN_PENDING_DAYS }))
      .catch(() => undefined);
  }
});

const openKey = (page: Page, key: string, tab?: string) =>
  page.goto(`/kms/keys/detail?${new URLSearchParams({ key, ...(tab ? { tab } : {}) })}`);

const runAction = async (page: Page, action: string) => {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
};

const status = (page: Page) => page.getByText(/^(Enabled|Disabled|Pending deletion)/).first();

test("creates a symmetric key with an alias", async ({ page }) => {
  await page.goto("/kms/keys/create");
  await page.getByRole("textbox", { name: /Alias/ }).fill(aliasName);
  await page.getByRole("button", { name: "Create key" }).last().click();

  await expect(flash(page)).toContainText(`Created key ${aliasName}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(aliasName);
  await page.getByRole("tab", { name: "Aliases" }).click();
  await expect(page.getByRole("cell", { name: aliasName })).toBeVisible();
});

// Review 2026-11-25: Floci nhận alias trùng, form Create key phải chặn
test("blocks creating a key with an alias another key has", async ({ page }) => {
  await page.goto("/kms/keys/create");
  await page.getByRole("textbox", { name: /Alias/ }).fill(aliasName);
  await page.getByRole("button", { name: "Create key" }).last().click();

  await expect(page.getByText("This alias already exists.")).toBeVisible();
  await expect(page).toHaveURL(/\/kms\/keys\/create$/);
});

test("encrypts and decrypts in Try it, opened by alias", async ({ page }) => {
  await openKey(page, aliasName, "try-it");
  await page.getByRole("textbox", { name: "Plaintext" }).fill("xin chào");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  const ciphertext = page.locator('[aria-label="Ciphertext (base64)"]:not(textarea)');
  await expect(ciphertext).toBeVisible();

  await page
    .getByRole("textbox", { name: "Ciphertext (base64)" })
    .fill(await ciphertext.innerText());
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.locator('[aria-label="Plaintext"]:not(textarea)')).toHaveText("xin chào");
});

test("disables, enables, schedules and cancels deletion", async ({ page }) => {
  await openKey(page, aliasName);
  await runAction(page, "Disable");
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(status(page)).toHaveText("Disabled");

  await runAction(page, "Enable");
  await expect(status(page)).toHaveText("Enabled");

  await runAction(page, "Schedule deletion");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton").fill(String(MIN_PENDING_DAYS));
  const confirm = dialog.getByRole("textbox");
  await confirm.fill((await confirm.getAttribute("placeholder")) ?? "");
  await dialog.getByRole("button", { name: "Schedule deletion" }).click();
  await expect(status(page)).toContainText("Pending deletion");

  await runAction(page, "Cancel deletion");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel deletion" }).click();
  await expect(status(page)).toHaveText("Enabled");
});

test("signs and verifies with an ECC key", async ({ page }) => {
  const { KeyMetadata } = await kms.send(
    new CreateKeyCommand({
      KeySpec: "ECC_NIST_P256",
      KeyUsage: "SIGN_VERIFY",
      Description: uniqueName("kmsecc"),
    }),
  );
  const keyId = KeyMetadata?.KeyId ?? "";
  keyIds.push(keyId);

  await openKey(page, keyId, "try-it");
  const messages = page.getByRole("textbox", { name: "Message" });
  await messages.first().fill("hello");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  const signature = page.locator('[aria-label="Signature (base64)"]:not(textarea)');
  await expect(signature).toBeVisible();

  await messages.last().fill("hello");
  await page.getByRole("textbox", { name: "Signature (base64)" }).fill(await signature.innerText());
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await expect(page.getByText("-----BEGIN PUBLIC KEY-----")).toBeVisible();
});

test("AWS managed keys are read-only", async ({ page }) => {
  await page.goto("/kms/aws-keys");
  await expect(page.getByRole("link", { name: "alias/aws/sqs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create key" })).toHaveCount(0);

  await page.getByRole("link", { name: "alias/aws/sqs" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("alias/aws/sqs");
  await expect(page.getByRole("button", { name: "Actions" })).toHaveCount(0);
});
