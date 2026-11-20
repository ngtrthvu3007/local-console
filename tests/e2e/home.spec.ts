import { expect, test } from "./fixtures.ts";

const SERVICES = ["S3", "Lambda", "DynamoDB", "ElastiCache", "Amazon MQ", "SES"];

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
  ] as const;
  for (const [link, url, heading] of pages) {
    await navigation.getByRole("link", { name: link, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(`^${heading}`) }),
    ).toBeVisible();
  }
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
  // Giả lập Floci tắt qua /api/health; các request khác vẫn tới Floci thật nên không có lỗi mạng
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { status: "unavailable", endpoint: "http://localhost.floci.io:4566", error: "down" },
    }),
  );
  await page.goto("/sqs/queues");
  await expect(page.getByRole("heading", { level: 1, name: "Floci isn't running" })).toBeVisible();
  await expect(page.getByText("docker compose up -d floci", { exact: true })).toBeVisible();

  // Home vẫn hiện, tự báo trạng thái Floci
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console Home" })).toBeVisible();

  await page.goto("/sqs/queues");
  await page.unroute("**/api/health");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Queues/ })).toBeVisible();
});
