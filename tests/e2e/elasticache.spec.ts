import { consoleConfig, elastiCache } from "../it/helpers.ts";
import { confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của ElastiCache trên UI: tạo cluster → Available → tạo key → đọc lại → xóa key → xóa cluster.
// Floci bật một container Valkey thật cho cluster

const cluster = uniqueName("cache");
const key = `${cluster}:greeting`;
const VALUE = "xin chào";

test.describe.configure({ mode: "serial" });

let region: string;

test.beforeAll(async () => {
  region = (await consoleConfig()).region;
});

// Test fail giữa chừng không để lại container Valkey; cluster đã xóa thì Floci trả lỗi, bỏ qua
test.afterAll(async () => {
  await elastiCache(region, "DeleteReplicationGroup", { ReplicationGroupId: cluster });
});

test("creates a cluster and waits until it is available", async ({ page }) => {
  await page.goto("/elasticache/clusters/create");
  await page.getByRole("textbox", { name: "Name" }).fill(cluster);
  await page.getByRole("button", { name: "Create cluster" }).click();

  await expect(page).toHaveURL(new RegExp(`/elasticache/clusters/${cluster}`));
  await expect(flash(page)).toContainText(`Created cluster ${cluster}`);
  // Lần đầu Floci kéo image Valkey (~130 MB)
  await expect(page.getByRole("button", { name: "Create key" }).first()).toBeEnabled({
    timeout: 120_000,
  });
});

test("creates a string key and reads it back", async ({ page }) => {
  await page.goto(`/elasticache/clusters/${cluster}`);
  await page.getByRole("button", { name: "Create key" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Key" }).fill(key);
  await dialog.locator(".ace_text-input").fill(VALUE);
  await dialog.getByRole("button", { name: "Create key" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: key }).click();
  await expect(page.getByText(VALUE).first()).toBeVisible();
});

test("deletes the key", async ({ page }) => {
  await page.goto(`/elasticache/clusters/${cluster}`);
  await page
    .getByRole("row", { name: new RegExp(key) })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));

  await expect(page.getByText("This database is empty.")).toBeVisible();
});

test("deletes the cluster from the list", async ({ page }) => {
  await page.goto("/elasticache/clusters");
  await page
    .getByRole("row", { name: new RegExp(cluster) })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));

  await expect(page.getByRole("row", { name: new RegExp(cluster) })).toHaveCount(0, {
    timeout: 60_000,
  });
});
