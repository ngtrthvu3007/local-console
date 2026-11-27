import type { Page } from "@playwright/test";
import {
  CloudFrontClient,
  DeleteDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { choose, confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của CloudFront trên UI (spec CloudFront 3, 8): tạo distribution từ trang bucket có SPA →
// URL local phục vụ deep link → thêm origin + behavior /api/* → invalidation → tắt → xóa.
// Không trỏ origin vào bucket đã xóa: HeadBucket 404 làm trình duyệt ghi console.error

const HOME = "<h1>home</h1>";
const PING = "pong";
const site = uniqueName("cfsite");
const api = uniqueName("cfapi");
const objects = [
  { Bucket: site, Key: "index.html", Body: HOME, ContentType: "text/html" },
  { Bucket: api, Key: "api/ping.txt", Body: PING },
];

test.describe.configure({ mode: "serial" });

let s3: S3Client;
let cloudfront: CloudFrontClient;
let region = "";
let flociPublicUrl = "";
let id = "";

// Như localUrl của console: host cố định, port của Floci
const localUrl = (path = "") => {
  const url = new URL(flociPublicUrl);
  url.hostname = `${id.toLowerCase()}.cloudfront.localhost`;
  return `${url.origin}/${path}`;
};

const openTab = (page: Page, tab: string) =>
  page.goto(`/cloudfront/distributions/${id}?${new URLSearchParams({ tab })}`);

const runAction = async (page: Page, action: string) => {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
};

test.beforeAll(async () => {
  ({ region, flociPublicUrl } = await consoleConfig());
  const config = viaConsole(region);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  cloudfront = new CloudFrontClient(config);
  for (const Bucket of [site, api]) await s3.send(new CreateBucketCommand({ Bucket }));
  for (const object of objects) await s3.send(new PutObjectCommand(object));
});

test.afterAll(async () => {
  // Distribution còn sót khi test giữa chừng fail: tắt rồi xóa
  const current = id
    ? await cloudfront.send(new GetDistributionConfigCommand({ Id: id })).catch(() => undefined)
    : undefined;
  if (current?.DistributionConfig) {
    const { ETag } = current.DistributionConfig.Enabled
      ? await cloudfront.send(
          new UpdateDistributionCommand({
            Id: id,
            IfMatch: current.ETag,
            DistributionConfig: { ...current.DistributionConfig, Enabled: false },
          }),
        )
      : current;
    await cloudfront.send(new DeleteDistributionCommand({ Id: id, IfMatch: ETag }));
  }
  for (const { Bucket, Key } of objects) await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  for (const Bucket of [site, api]) await s3.send(new DeleteBucketCommand({ Bucket }));
});

test("creates a single-page app distribution from the bucket page", async ({ page }) => {
  await page.goto(`/s3/buckets/${site}?tab=properties`);
  await expect(page.getByText("No distributions serve this bucket")).toBeVisible();
  await page.getByRole("link", { name: "Create distribution" }).click();

  await expect(page.getByRole("button", { name: /Bucket/ })).toContainText(site);
  await page.getByText("Single-page app", { exact: true }).click();
  await page.getByRole("button", { name: "Create distribution" }).last().click();

  await expect(flash(page)).toContainText("Created distribution");
  id = page.url().split("/").pop() ?? "";
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(id);

  const deepLink = await page.request.get(localUrl("deep/link"));
  expect(deepLink.status()).toBe(200);
  expect(await deepLink.text()).toBe(HOME);
});

test("sends /api/* to a second bucket", async ({ page }) => {
  const apiOrigin = `${api}.s3.${region}.amazonaws.com`;

  await openTab(page, "origins");
  await page.getByRole("button", { name: "Create origin" }).click();
  const originDialog = page.getByRole("dialog");
  await choose(page, originDialog, /Bucket/, { name: api });
  await originDialog.getByRole("button", { name: "Create origin" }).click();
  await expect(flash(page)).toContainText(`Saved origin ${apiOrigin}`);

  await openTab(page, "behaviors");
  await page.getByRole("button", { name: "Create behavior" }).click();
  const behaviorDialog = page.getByRole("dialog");
  await behaviorDialog.getByRole("textbox", { name: "Path pattern" }).fill("/api/*");
  await choose(page, behaviorDialog, /Origin/, { name: apiOrigin });
  await behaviorDialog.getByRole("button", { name: "Create behavior" }).click();
  await expect(flash(page)).toContainText("Saved behavior /api/*");

  const ping = await page.request.get(localUrl("api/ping.txt"));
  expect(await ping.text()).toBe(PING);
});

test("creates an invalidation that completes at once", async ({ page }) => {
  await openTab(page, "invalidations");
  await page.getByRole("button", { name: "Create invalidation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create invalidation" }).click();

  await expect(flash(page)).toContainText("Created invalidation");
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
});

test("disables, then deletes the distribution", async ({ page }) => {
  await page.goto(`/cloudfront/distributions/${id}`);
  await runAction(page, "Disable");
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText("Disabled", { exact: true }).first()).toBeVisible();
  expect((await page.request.get(localUrl())).status()).toBe(404);

  await runAction(page, "Delete");
  await confirmDelete(page.getByRole("dialog"));
  await expect(page).toHaveURL(/\/cloudfront\/distributions$/);

  await page.goto(`/s3/buckets/${site}?tab=properties`);
  await expect(page.getByText("No distributions serve this bucket")).toBeVisible();
});
