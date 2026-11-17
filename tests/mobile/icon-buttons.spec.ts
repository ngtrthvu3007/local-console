import { test, expect, hasTouchTarget } from "./fixtures.ts";

test.describe("mobile refresh button shape", () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const width of [320, 390, 430]) {
    test(`refresh stays square and centered at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      // Trang danh sách gộp Refresh vào menu ▾ trên phone (alignment.spec kiểm); chỉ Home còn nút icon riêng.
      for (const path of ["/"]) {
        await test.step(path, async () => {
          await page.goto(path);
          const refresh = page.getByRole("button", { name: "Refresh", exact: true });
          await expect(refresh).toBeEnabled();
          await expect
            .poll(
              () =>
                refresh.evaluate((element) => {
                  const button = element.getBoundingClientRect();
                  const icon = element.querySelector("svg")?.getBoundingClientRect();
                  return (
                    Math.abs(button.width - button.height) < 1 &&
                    Boolean(
                      icon &&
                      Math.abs(icon.x + icon.width / 2 - button.x - button.width / 2) < 1 &&
                      Math.abs(icon.y + icon.height / 2 - button.y - button.height / 2) < 1,
                    )
                  );
                }),
              { message: "refresh needs a square shape and a centered icon" },
            )
            .toBe(true);
          expect(await hasTouchTarget(refresh), "refresh needs a 44px touch target").toBe(true);
          if (path === "/")
            await page.screenshot({
              path: testInfo.outputPath("home-refresh.png"),
              animations: "disabled",
            });
        });
      }
    });
  }
});
