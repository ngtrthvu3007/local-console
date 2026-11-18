import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, test, uniqueName } from "./fixtures.ts";

const sender = `${uniqueName("sender")}@example.com`;
const subject = uniqueName("mail");

const SANDBOX_BLOCKED_LOG = "Blocked script execution";

// Chrome ghi console.error mỗi lần sandbox chặn script: không phải lỗi của trang
const dropSandboxNoise = (errors: string[]) =>
  errors.splice(0, errors.length, ...errors.filter((line) => !line.includes(SANDBOX_BLOCKED_LOG)));

test.describe.configure({ mode: "serial" });

test("add a sender identity", async ({ page }) => {
  await page.goto("/ses/identities");
  await page.getByRole("button", { name: "Add email" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Email address" }).fill(sender);
  await dialog.getByRole("button", { name: "Add email" }).click();
  await expect(page.getByRole("row", { name: new RegExp(sender) })).toContainText("Verified");
});

test("open a sent mail: scripts stay off, links open a new tab", async ({ page, baseURL, context, pageErrors }) => {
  const ses = new SESv2Client(viaConsole((await consoleConfig()).region));
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: ["to@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Html: {
              Data: `<a href="${baseURL}/ses/identities">Confirm account</a><script>document.body.dataset.ran = "yes"</script>`,
            },
          },
        },
      },
    }),
  );
  await page.goto("/ses/mailbox");
  await page.getByRole("row", { name: new RegExp(subject) }).click();
  const frame = page.frameLocator('iframe[title="Email HTML"]');
  const link = frame.getByRole("link", { name: "Confirm account" });
  await expect(link).toBeVisible();
  await expect(frame.locator("body")).not.toHaveAttribute("data-ran", /.*/);
  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await expect(popup).toHaveURL(/\/ses\/identities$/);
  await popup.close();
  dropSandboxNoise(pageErrors);
});

test("delete the mail and the identity", async ({ page, pageErrors }) => {
  await page.goto("/ses/mailbox");
  await page.getByRole("row", { name: new RegExp(subject) }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row", { name: new RegExp(subject) })).toHaveCount(0);
  dropSandboxNoise(pageErrors);

  await page.goto("/ses/identities");
  await page.getByRole("row", { name: new RegExp(sender) }).getByRole("checkbox").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const identityDialog = page.getByRole("dialog");
  await identityDialog.getByRole("textbox").fill("delete");
  await identityDialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row", { name: new RegExp(sender) })).toHaveCount(0);
});
