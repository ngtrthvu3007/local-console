import { test as base, expect, type Locator, type Page } from "@playwright/test";

export { expect };

// Mọi resource e2e tạo ra đều có tiền tố này (dọn bằng: node it/leftovers.mjs)
export const uniqueName = (kind: string) =>
  `lc-e2e-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const LAMBDA_ROLE = "lc-e2e-lambda";

// Bucket chưa đặt lifecycle/tag thì S3 trả 404, console coi là rỗng (orEmptyWhenNotFound);
// trình duyệt vẫn ghi console.error cho request 404 nên bỏ qua đúng các request này
const NOT_CONFIGURED_S3_QUERY = /\/aws\/[^/?]+\/\?(lifecycle|tagging)=?$/;
// Function chưa có resource policy thì Lambda trả 404 cho GetPolicy, tab Triggers coi là không có dòng
const NOT_CONFIGURED_LAMBDA_POLICY = /\/aws\/2015-03-31\/functions\/[^/]+\/policy$/;
const isExpectedNotFound = (text: string, url: string) =>
  text.includes("404") &&
  (NOT_CONFIGURED_S3_QUERY.test(url) || NOT_CONFIGURED_LAMBDA_POLICY.test(url));

// Test cố ý để tham chiếu treo (xóa queue mà rule còn trỏ tới): Link của console dò resource đã xóa
// nên trình duyệt ghi một console.error 400/404 tới /aws/. Chỉ bật bằng test.use({ danglingProbes: true })
const isDanglingProbe = (text: string, url: string) =>
  /status of (400|404)/.test(text) && new URL(url).pathname.startsWith("/aws/");

// Tab Test của API Gateway cố ý gọi method trả 4xx (thiếu token, Lambda đã xóa): trình duyệt vẫn ghi
// console.error. Chỉ bật bằng test.use({ userRequestErrors: true })
const USER_REQUEST_PATH = /^\/aws\/restapis\/[^/]+\/[^/]+\/_user_request_\//;
const isUserRequestError = (text: string, url: string) =>
  /status of 4\d\d/.test(text) && USER_REQUEST_PATH.test(new URL(url).pathname);

// Lỗi JS hoặc console.error trên trang là lỗi của test, trừ lỗi mạng mà test cố ý gây ra
export const test = base.extend<{
  pageErrors: string[];
  danglingProbes: boolean;
  userRequestErrors: boolean;
}>({
  danglingProbes: [false, { option: true }],
  userRequestErrors: [false, { option: true }],
  pageErrors: [
    async ({ page, danglingProbes, userRequestErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (isExpectedNotFound(message.text(), message.location().url)) return;
        if (danglingProbes && isDanglingProbe(message.text(), message.location().url)) return;
        if (userRequestErrors && isUserRequestError(message.text(), message.location().url)) return;
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

// Editor là Ace: gõ từng phím bị Ace tự đóng ngoặc nên đặt giá trị qua instance của nó
export async function setEditor(page: Page, text: string, index = 0) {
  await page
    .locator(".ace_editor")
    .nth(index)
    .evaluate((element, value) => {
      (
        element as unknown as { env: { editor: { setValue(text: string): void } } }
      ).env.editor.setValue(value);
    }, text);
}
