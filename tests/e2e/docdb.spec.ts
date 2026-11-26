import {
  CreateDBClusterCommand,
  CreateDBInstanceCommand,
  DeleteDBClusterCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
} from "@aws-sdk/client-rds";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import type { Page } from "@playwright/test";
import { confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của DocumentDB trên UI: tạo cluster 2 instance → Connectivity (connection string, lệnh socat)
// → thêm / xóa instance → xóa cluster. Floci bật một container MongoDB thật cho cluster

const cluster = uniqueName("docdb");
const extraInstance = `${cluster}-extra`;
// Cluster tạo lỗi ở bước instance: id <partial>-2 đã thuộc về cluster `holder`
const partial = uniqueName("docdb-partial");
const holder = uniqueName("docdb-holder");
const PASSWORD = "e2e-pass-123";

test.describe.configure({ mode: "serial" });

let rds: RDSClient;

test.beforeAll(async () => {
  rds = new RDSClient(viaConsole((await consoleConfig()).region));
});

// Test fail giữa chừng không để lại container MongoDB; resource đã xóa thì Floci trả lỗi, bỏ qua
test.afterAll(async () => {
  const ids = [cluster, partial, holder];
  const { DBInstances = [] } = await rds.send(new DescribeDBInstancesCommand({}));
  for (const instance of DBInstances.filter((item) => ids.includes(item.DBClusterIdentifier ?? "")))
    await rds
      .send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: instance.DBInstanceIdentifier }))
      .catch(() => undefined);
  for (const id of ids)
    await rds
      .send(new DeleteDBClusterCommand({ DBClusterIdentifier: id, SkipFinalSnapshot: true }))
      .catch(() => undefined);
});

async function fillCreateForm(page: Page, id: string, instances: number) {
  await page.goto("/docdb/clusters/create");
  await page.getByRole("textbox", { name: "Cluster identifier" }).fill(id);
  await page.getByRole("textbox", { name: "Number of instances" }).fill(String(instances));
  await page.getByRole("textbox", { name: "Master username" }).fill("admin1");
  await page.getByLabel("Master password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm master password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create cluster" }).click();
}

test("blocks an identifier with two hyphens in a row", async ({ page }) => {
  await page.goto("/docdb/clusters/create");
  const identifier = page.getByRole("textbox", { name: "Cluster identifier" });
  await identifier.fill("bad--name");
  await page.getByRole("button", { name: "Create cluster" }).click();

  await expect(identifier).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/docdb\/clusters\/create$/);
});

test("creates a cluster with two instances and shows how to connect", async ({ page }) => {
  await fillCreateForm(page, cluster, 2);

  await expect(page).toHaveURL(new RegExp(`/docdb/clusters/${cluster}`));
  await expect(flash(page)).toContainText(`Created cluster ${cluster}`);
  // Connection string trỏ tới endpoint của cluster; lệnh socat chỉ mở cổng trên 127.0.0.1
  await expect(
    page.getByText(/^mongodb:\/\/admin1:<password>@\d+\.\d+\.\d+\.\d+:27017\//),
  ).toBeVisible();
  await expect(page.getByText(`floci-aws-docdb-${cluster}`).first()).toBeVisible();
  await expect(page.getByText(/-p 127\.0\.0\.1:27017:27017/)).toBeVisible();
  await expect(page.getByText(/Percent-encode special characters/)).toHaveCount(2);
  await expect(page.getByText(/before docker compose down/)).toBeVisible();
});

test("adds and deletes an instance", async ({ page }) => {
  await page.goto(`/docdb/clusters/${cluster}?tab=instances`);
  const panel = page.getByRole("tabpanel", { name: "Instances" });
  await expect(panel.getByRole("rowheader")).toHaveCount(2);

  await panel.getByRole("button", { name: "Add instance" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Instance identifier" }).fill(extraInstance);
  await dialog.getByRole("button", { name: "Add instance" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByRole("rowheader")).toHaveCount(3);

  await panel.getByRole("checkbox", { name: `Select instance ${extraInstance}` }).check();
  await panel.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(panel.getByRole("rowheader")).toHaveCount(2);
});

test("deletes the cluster from its page", async ({ page }) => {
  await page.goto(`/docdb/clusters/${cluster}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));

  await expect(page).toHaveURL(/\/docdb\/clusters$/);
  await expect(page.getByRole("row", { name: new RegExp(cluster) })).toHaveCount(0);
});

// Trang chi tiết dò cluster trong danh sách nên không có request 404 (spec 7 #5)
test("shows a missing cluster as not found", async ({ page }) => {
  const missing = uniqueName("docdb-missing");
  await page.goto(`/docdb/clusters/${missing}`);
  await expect(page.getByText(`Cluster ${missing} not found`)).toBeVisible();
});

// Cluster đã tạo mà một instance lỗi: vẫn mở trang cluster, cảnh báo nêu instance lỗi (review minor)
test.describe("when an instance fails while creating a cluster", () => {
  // CreateDBInstance trùng id trả 400: trình duyệt ghi console.error, đúng mong đợi
  test.use({ danglingProbes: true });

  test("opens the created cluster and names the failed instance", async ({ page }) => {
    await rds.send(
      new CreateDBClusterCommand({
        DBClusterIdentifier: holder,
        Engine: "docdb",
        MasterUsername: "admin1",
        MasterUserPassword: PASSWORD,
      }),
    );
    await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: `${partial}-2`,
        DBClusterIdentifier: holder,
        Engine: "docdb",
        DBInstanceClass: "db.t3.medium",
      }),
    );

    await fillCreateForm(page, partial, 2);

    await expect(page).toHaveURL(new RegExp(`/docdb/clusters/${partial}$`));
    await expect(flash(page)).toContainText(`Created cluster ${partial}, 1 item failed`);
    await expect(flash(page)).toContainText(`${partial}-2:`);
    await expect(page.getByText("1 instance", { exact: false }).first()).toBeVisible();
  });
});
