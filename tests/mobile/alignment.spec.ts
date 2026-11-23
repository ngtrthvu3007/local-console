import { test, expect, hasTouchTarget, resourceName } from "./fixtures.ts";

// Các rule touch-target 44px trong Layout.css từng làm lệch control của
// Cloudscape; test kích thước không bắt được.
test.describe("mobile touch targets keep alignment", () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const width of [320, 390, 430]) {
    test(`buttons, row selection, breadcrumb and menu stay aligned at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/s3/buckets");

      const create = page.getByRole("link", { name: "Create bucket" });
      await expect
        .poll(
          () =>
            create.evaluate((element) => {
              const button = element.getBoundingClientRect();
              const text = [...element.querySelectorAll("span")]
                .filter((span) => span.textContent?.trim() === "Create bucket")
                .at(-1)
                ?.getBoundingClientRect();
              return Boolean(
                text && Math.abs(text.top - button.top - (button.bottom - text.bottom)) < 1,
              );
            }),
          { message: "link-button text must be vertically centered" },
        )
        .toBe(true);
      expect(await hasTouchTarget(create), "link-button needs a 44px touch target").toBe(true);

      const toolbar = await page.locator(".console-actions").first().boundingBox();
      const search = await page.getByRole("searchbox").first().boundingBox();
      expect(
        Math.abs(
          (toolbar?.x ?? 0) + (toolbar?.width ?? 0) - (search?.x ?? 0) - (search?.width ?? 0),
        ),
        "toolbar and search must share the right edge",
      ).toBeLessThan(2);
      const title = await page.getByRole("heading", { level: 1 }).boundingBox();
      if (width >= 390)
        expect(
          Math.abs(
            (title?.y ?? 0) +
              (title?.height ?? 0) / 2 -
              (toolbar?.y ?? 0) -
              (toolbar?.height ?? 0) / 2,
          ),
          "title and toolbar share one row when there is room",
        ).toBeLessThan(12);
      await page.getByRole("button", { name: "More actions" }).click();
      await expect(page.getByRole("menuitem", { name: "Refresh" })).toBeVisible();
      await page.keyboard.press("Escape");

      const radio = page.locator("tbody input[type=radio]").first();
      await expect(radio).toBeAttached();
      const inRow = await radio.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const row = element.closest("tr")?.getBoundingClientRect();
        return Boolean(row && box.top >= row.top && box.bottom <= row.bottom);
      });
      expect(inRow, "row radio must stay inside its row").toBe(true);

      await page.goto("/s3/buckets/create");
      const chevronTops = await page
        .locator("nav ol")
        .first()
        .evaluate((list) =>
          [...list.querySelectorAll("svg")]
            .map((svg) => svg.getBoundingClientRect())
            .filter((box) => box.width > 0)
            .map((box) => Math.round(box.top)),
        );
      expect(chevronTops.length).toBeGreaterThan(1);
      expect(new Set(chevronTops).size, "breadcrumb chevrons must share one line").toBe(1);

      await page.goto(`/s3/buckets/${resourceName}/upload`);
      await expect(page.getByText("Drag and drop files or folders here")).toBeHidden();
      // Mỗi hàng nút (cùng hàng hoặc đã xuống dòng) phải chừa trống trái và
      // phải bằng nhau
      const imbalance = await page.locator(".console-actions--center").evaluate((group) => {
        const frame = group.getBoundingClientRect();
        const rows = new Map<number, { left: number; right: number }>();
        for (const button of group.children) {
          const box = button.getBoundingClientRect();
          const row = rows.get(Math.round(box.top)) ?? {
            left: box.left,
            right: box.right,
          };
          rows.set(Math.round(box.top), {
            left: Math.min(row.left, box.left),
            right: Math.max(row.right, box.right),
          });
        }
        return Math.max(
          ...[...rows.values()].map((row) =>
            Math.abs(row.left - frame.left - (frame.right - row.right)),
          ),
        );
      });
      expect(imbalance, "upload buttons stay centered").toBeLessThan(2);

      await page.goto("/");
      // Test vừa mở S3 nên Home có link Amazon S3 trong thẻ Recently visited
      await page.waitForLoadState("networkidle");
      expect(
        await hasTouchTarget(page.getByRole("link", { name: "Amazon S3", exact: true })),
        "service links need a 44px touch target",
      ).toBe(true);

      await page.getByRole("button", { name: "Open side navigation" }).click();
      const links = page.getByRole("navigation", { name: "Side navigation" }).getByRole("link");
      await expect(links.first()).toBeVisible();
      for (const height of await links.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().height),
      ))
        expect(height, "side navigation links need a 44px touch target").toBeGreaterThanOrEqual(44);
    });
  }
});
