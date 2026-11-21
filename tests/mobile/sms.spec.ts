import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.ts";

const PHONE_NUMBER = "+84 900 000 111";
const SMS_MESSAGE = "Your verification code is 123456";
const VIEWPORT_WIDTHS = [320, 390, 430, 768, 1024, 1440];

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

for (const width of VIEWPORT_WIDTHS) {
  test(`SMS inbox keeps a formatted number readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 });
    await page.goto("/sns/sms");

    const row = page.getByRole("row", { name: PHONE_NUMBER });
    await expect(row).toContainText(SMS_MESSAGE);
    await expect(row).toContainText(PHONE_NUMBER);
    await expect
      .poll(() => row.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`sms-${width}px.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}
