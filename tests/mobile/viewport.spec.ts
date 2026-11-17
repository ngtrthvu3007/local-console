import { test, expect } from "./fixtures.ts";

test.describe("touch viewport edges", () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const width of [390, 430]) {
    test(`Home fills the ${width}px touch viewport without a reserved gutter`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "Console Home" })).toBeVisible();
      await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "auto");
      const edges = await page.locator("#top-nav").evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, viewport: window.innerWidth };
      });
      expect(edges.left).toBe(0);
      expect(edges.right).toBeCloseTo(edges.viewport, 0);
      await page.screenshot({
        path: testInfo.outputPath("home-touch.png"),
        animations: "disabled",
      });
    });
  }
});

test("desktop keeps its reserved scrollbar gutter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console Home" })).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "stable");
});
