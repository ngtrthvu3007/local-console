import { test, expect, resourceName, hasTouchTarget } from "./fixtures.ts";
import type { Page } from "@playwright/test";

const pages = [
  "/",
  "/s3/buckets",
  "/dynamodb/tables",
  "/lambda/functions",
  "/elasticache/clusters",
  "/mq/brokers",
  ...[
    "s3/buckets",
    "dynamodb/tables",
    "lambda/functions",
    "elasticache/clusters",
    "mq/brokers",
  ].map((path) => `/${path}/create`),
];
async function fits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}
for (const width of [320, 390, 430, 688, 768, 1440]) {
  test(`all main pages fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 });
    for (const path of pages) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (!path.endsWith("/create") && path !== "/")
          await expect(page.getByRole("row", { name: new RegExp(resourceName) })).toBeVisible();
        await fits(page);
        const unnamed = (await page.locator("body").ariaSnapshot())
          .split("\n")
          .filter((line) =>
            /^\s*- (button|link|checkbox|radio|textbox|combobox|searchbox|switch|tab)( \[[^\]\"]*\])*:?$/.test(
              line,
            ),
          );
        expect(unnamed, "interactive controls have accessible names").toEqual([]);
        if (width <= 688) {
          if (path.endsWith("/create")) {
            const submit = page.locator("form").getByRole("button", { name: /^Create / });
            expect(await hasTouchTarget(submit), "submit needs a 44px touch target").toBe(true);
            expect((await submit.boundingBox())!.width).toBeGreaterThanOrEqual(width - 60);
          }
          for (const table of await page.locator(".console-table table").all()) {
            expect(
              await table.evaluate(
                (element) =>
                  element.getBoundingClientRect().width -
                  element.closest(".console-table")!.getBoundingClientRect().width,
              ),
              "table fits its container",
            ).toBeLessThanOrEqual(1);
          }
        }
        await page.screenshot({
          path: testInfo.outputPath(`${path.replaceAll("/", "-") || "home"}.png`),
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  });
}
for (const width of [320, 390, 430]) {
  test(`selection, sorting, modal and navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/lambda/functions");
    const row = page.getByRole("row", { name: new RegExp(resourceName) });
    await row.getByRole("checkbox").check();
    await expect(page.getByRole("status").filter({ hasText: "1 selected" })).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath("delete-modal.png"),
      fullPage: false,
      animations: "disabled",
    });
    const confirm = dialog.getByRole("textbox");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await confirm.fill((await confirm.getAttribute("placeholder"))!);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: /^Sort by/ }).click();
    await page.getByRole("option", { name: "Runtime" }).click();
    await expect(page.locator("tbody tr").first()).toContainText(resourceName);
    await page.getByRole("button", { name: "Sort descending" }).click();
    await expect(page.getByRole("button", { name: "Sort ascending" })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toContainText("aaa-function");
    await page.getByRole("button", { name: "Open side navigation" }).click();
    const navigation = page.getByRole("navigation", { name: "Side navigation" });
    await navigation.getByRole("link", { name: "S3", exact: true }).click();
    await expect(page).toHaveURL(/\/s3\/buckets$/);
    await expect(navigation.getByRole("link", { name: "S3", exact: true })).toBeHidden();
  });
  test(`upload names and progress stay together at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/s3/buckets/${resourceName}/upload`);
    const name = `${"very-long-file-name-".repeat(5)}.txt`;
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("test") });
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row.getByText("Waiting", { exact: true })).toBeVisible();
    await expect(row).toContainText("Size");
    await expect
      .poll(() => row.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    await fits(page);
    await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("upload.png"),
      fullPage: true,
      animations: "disabled",
    });
  });
  test(`validation, detail identifiers and trigger modal at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/s3/buckets/create");
    await page.getByRole("textbox", { name: "Bucket name" }).fill("Bad_Name");
    await page.locator("form").getByRole("button", { name: "Create bucket", exact: true }).click();
    await expect(
      page.locator('[class*="awsui_error__"], [class*="awsui_error_"]').first(),
    ).toBeVisible();
    await fits(page);
    const hint = page.getByText("3–63 characters: lowercase letters, numbers, dots and hyphens.", {
      exact: true,
    });
    await expect(hint).toBeHidden();
    await page.getByRole("textbox", { name: "Bucket name" }).fill("valid-mobile-bucket");
    await expect(hint).toBeVisible();
    await page.goto(`/lambda/functions/${resourceName}?tab=triggers`);
    await expect(page.getByRole("heading", { level: 1, name: resourceName })).toBeVisible();
    await page.getByRole("button", { name: "Add trigger", exact: true }).click();
    const bucketSelect = page.getByRole("button", { name: "Bucket Choose a bucket" });
    await expect(bucketSelect).toBeVisible();
    await expect
      .poll(async () => (await bucketSelect.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath("trigger-modal.png"),
      fullPage: false,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
}

for (const width of [320, 390, 430]) {
  test(`detail pages keep long identifiers readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      `/s3/buckets/${resourceName}`,
      `/dynamodb/tables/${resourceName}`,
      `/lambda/functions/${resourceName}?tab=monitor`,
      `/lambda/functions/${resourceName}?tab=test`,
      `/elasticache/clusters/${resourceName}?tab=details`,
      "/mq/brokers/mobile-broker?tab=details",
    ]) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: resourceName })).toBeVisible();
        await fits(page);
        await page.screenshot({
          path: testInfo.outputPath(
            `${path.split("/")[1]}-${path.split("tab=")[1] ?? "details"}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  });
}

for (const width of [320, 390, 430]) {
  test(`Redis panel, MQ publish and Lambda logs work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/elasticache/clusters/${resourceName}`);
    await page
      .getByRole("table", { name: "Keys", exact: true })
      .getByRole("link", { name: resourceName, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Fields", exact: false })).toBeVisible();
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath("redis-panel.png"),
      fullPage: false,
      animations: "disabled",
    });
    await page.goto("/mq/brokers/mobile-broker");
    await page.getByRole("textbox", { name: "Username" }).fill("mobile-user");
    await page.getByRole("textbox", { name: "Password" }).fill("mobile-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("row", { name: new RegExp(resourceName) })
      .getByRole("checkbox")
      .check();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Publish message" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Routing key" })).toHaveValue(resourceName);
    const payloadEditor = page.getByRole("dialog").locator(".ace_editor");
    await expect(payloadEditor).toBeVisible();
    await payloadEditor.locator(".ace_text-input").focus();
    await page.keyboard.type("Mobile test payload");
    await expect(payloadEditor).toContainText("Mobile test payload");
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath("mq-publish.png"),
      fullPage: false,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.goto(`/lambda/functions/${resourceName}?tab=test`);
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(page.getByText("Execution result: succeeded", { exact: true })).toBeVisible();
    const log = page.locator(".code-snippet--wrap pre");
    await expect(log).toHaveCSS("white-space", "pre-wrap");
    expect(
      await log.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath("lambda-result.png"),
      fullPage: true,
      animations: "disabled",
    });
  });
}
