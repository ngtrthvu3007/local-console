import { test as base, expect, type Page } from "@playwright/test";

export { expect };

// Mọi resource e2e tạo ra đều có tiền tố này (dọn bằng: node it/leftovers.mjs)
export const uniqueName = (kind: string) =>
  `lc-e2e-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Bucket chưa đặt lifecycle/tag thì S3 trả 404, console coi là rỗng (orEmptyWhenNotFound);
// trình duyệt vẫn ghi console.error cho request 404 nên bỏ qua đúng các request này
const NOT_CONFIGURED_S3_QUERY = /\/aws\/[^/?]+\/\?(lifecycle|tagging)=?$/;
const isExpectedNotFound = (text: string, url: string) =>
  text.includes("404") && NOT_CONFIGURED_S3_QUERY.test(url);

// Lỗi JS hoặc console.error trên trang là lỗi của test, trừ lỗi mạng mà test cố ý gây ra
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (isExpectedNotFound(message.text(), message.location().url)) return;
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
