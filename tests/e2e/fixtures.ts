import { test as base, expect, type Locator, type Page } from "@playwright/test";

export { expect };

// Mọi resource e2e tạo ra đều có tiền tố này (dọn bằng: node it/leftovers.mjs)
export const uniqueName = (kind: string) =>
  `lc-e2e-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Bucket chưa đặt lifecycle/tag thì S3 trả 404, console coi là rỗng (orEmptyWhenNotFound);
// trình duyệt vẫn ghi console.error cho request 404 nên bỏ qua đúng các request này
const NOT_CONFIGURED_S3_QUERY = /\/aws\/[^/?]+\/\?(lifecycle|tagging)=?$/;
const isExpectedNotFound = (text: string, url: string) =>
  text.includes("404") && NOT_CONFIGURED_S3_QUERY.test(url);

// Test cố ý để tham chiếu treo (xóa queue mà rule còn trỏ tới): Link của console dò resource đã xóa
// nên trình duyệt ghi một console.error 400/404 tới /aws/. Chỉ bật bằng test.use({ danglingProbes: true })
const isDanglingProbe = (text: string, url: string) =>
  /status of (400|404)/.test(text) && new URL(url).pathname.startsWith("/aws/");

// Lỗi JS hoặc console.error trên trang là lỗi của test, trừ lỗi mạng mà test cố ý gây ra
export const test = base.extend<{ pageErrors: string[]; danglingProbes: boolean }>({
  danglingProbes: [false, { option: true }],
  pageErrors: [
    async ({ page, danglingProbes }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (isExpectedNotFound(message.text(), message.location().url)) return;
        if (danglingProbes && isDanglingProbe(message.text(), message.location().url)) return;
        errors.push(`console.error: ${message.text()} @ ${message.location().url}`);
      });
      await use(errors);
      expect(errors, "no JavaScript errors on the page").toEqual([]);
    },
    { auto: true },
  ],
});

// Thông báo thành công / lỗi của console nằm trong Flashbar ở đầu trang
export const flash = (page: Page) => page.locator('[class*="awsui_flashbar"]');

// Cloudscape Select trong dialog: bấm nút của ô (tên khớp `field`), rồi chọn option. `.last()` vì ô
// đã chọn gần nhất nằm cuối khi label và nút cùng khớp tên
export async function choose(
  page: Page,
  dialog: Locator,
  field: RegExp,
  option: { name: string | RegExp; exact?: boolean },
) {
  await dialog.getByRole("button", { name: field }).last().click();
  await page.getByRole("option", option).click();
}

// Modal xóa bắt gõ chữ xác nhận ghi ở placeholder
export async function confirmDelete(dialog: Locator) {
  const confirm = dialog.getByRole("textbox");
  if (await confirm.count())
    await confirm.fill((await confirm.getAttribute("placeholder")) ?? "confirm");
  await dialog.getByRole("button", { name: /Delete/ }).click();
}
