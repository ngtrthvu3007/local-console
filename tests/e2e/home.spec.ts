import { expect, test } from "./fixtures.ts";

const SERVICES = ["S3", "Lambda", "DynamoDB", "ElastiCache", "Amazon MQ", "SES", "Cognito"];

test("home shows Floci status and every service", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Floci .* Running/ })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Side navigation" });
  for (const service of SERVICES) {
    await expect(navigation.getByRole("link", { name: service, exact: true })).toBeVisible();
  }
});

test("side navigation opens each service", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Side navigation" });
  const pages = [
    ["S3", /\/s3\/buckets$/, "Buckets"],
    ["Lambda", /\/lambda\/functions$/, "Functions"],
    ["DynamoDB", /\/dynamodb\/tables$/, "Tables"],
    ["ElastiCache", /\/elasticache\/clusters$/, "Clusters"],
    ["Amazon MQ", /\/mq\/brokers$/, "Brokers"],
    ["SES", /\/ses\/mailbox$/, "Mailbox"],
    ["Cognito", /\/cognito\/user-pools$/, "User pools"],
  ] as const;
  for (const [link, url, heading] of pages) {
    await navigation.getByRole("link", { name: link, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(`^${heading}`) }),
    ).toBeVisible();
  }
});

test("home lists recently visited services, newest first", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("No recently visited services")).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Side navigation" });
  await navigation.getByRole("link", { name: "SQS", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
  await navigation.getByRole("link", { name: "S3", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Buckets/ })).toBeVisible();
  await page.goto("/");
  const links = page.getByRole("main").getByRole("link", { name: /^Amazon (S3|SQS)$/ });
  await expect(links).toHaveText(["Amazon S3", "Amazon SQS"]);
  await links.last().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
});

test("search opens a service by name, '/' focuses it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console Home" })).toBeVisible();
  await page.keyboard.press("/");
  const search = page.getByRole("combobox", { name: "Search services" });
  await expect(search).toBeFocused();
  // Chỉ khớp tên service, không khớp mô tả: Enter không đi đâu
  await search.fill("queue service");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await search.fill("sqs");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
  await expect(search).toHaveValue("");
  // Gõ tiếp thuộc về trang vừa mở, không rơi lại vào ô search
  await expect(search).not.toBeFocused();
});

test("'/' typed in a page field stays in the field", async ({ page }) => {
  await page.goto("/sqs/queues");
  const filter = page.getByRole("searchbox").first();
  // Gõ từng phím (fill không phát keydown) để phím tắt có cơ hội cướp focus
  await filter.pressSequentially("a/b");
  await expect(filter).toHaveValue("a/b");
  await expect(filter).toBeFocused();
});

test("an unknown page keeps the console layout", async ({ page }) => {
  await page.goto("/s3/does-not-exist/at-all");
  await expect(page.getByRole("navigation", { name: "Side navigation" })).toBeVisible();
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to Console Home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a page asks to start Floci while it is down, and comes back once it answers", async ({
  page,
}) => {
  // Giả lập Floci tắt qua /api/health; các request khác vẫn tới Floci thật nên
  // không có lỗi mạng
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        status: "unavailable",
        endpoint: "http://localhost.floci.io:4566",
        error: "down",
      },
    }),
  );
  await page.goto("/sqs/queues");
  await expect(page.getByRole("heading", { level: 1, name: "Floci isn't running" })).toBeVisible();
  await expect(page.getByText("docker compose up -d floci", { exact: true })).toBeVisible();

  // Home vẫn hiện, tự báo trạng thái Floci
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console Home" })).toBeVisible();

  await page.goto("/sqs/queues");
  // Trang tải lười: chờ console kịp hỏi /api/health (vẫn giả lập) rồi mới cho
  // Floci "lên lại"
  await expect(page.getByRole("heading", { level: 1, name: "Floci isn't running" })).toBeVisible();
  await page.unroute("**/api/health");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
});

test("reset asks to type 'reset', then calls Floci's reset", async ({ page }) => {
  // Giả lập reset: test không bao giờ xóa dữ liệu Floci thật
  const resets: string[] = [];
  await page.route("**/aws/_floci/state/reset", (route) => {
    resets.push(route.request().method());
    return route.fulfill({ json: { status: "OK" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Reset data" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset all Floci data?" });
  await expect(dialog.getByText("docker compose restart floci")).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Reset", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("reset");
  await confirm.click();
  await expect(page.getByText("Reset Floci: all data deleted")).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(resets).toEqual(["POST"]);

  // Mở lại: chữ "reset" lần trước không được giữ, nút Reset phải khóa lại
  await page.getByRole("button", { name: "Reset data" }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("");
  await expect(confirm).toBeDisabled();
});
