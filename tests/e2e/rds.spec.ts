import type { Page } from "@playwright/test";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
} from "@aws-sdk/client-rds";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của RDS trên UI: Easy create → chi tiết → stop / start / reboot → xóa.
// DB managed tạo bằng SDK để kiểm link sang secret rds!…

const createdId = uniqueName("mysql");
const managedId = uniqueName("pg");
const stackName = uniqueName("rds-stack");
const stackDatabaseId = `${stackName}-db`;

test.describe.configure({ mode: "serial" });

let rds: RDSClient;
let cloudformation: CloudFormationClient;

test.beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  rds = new RDSClient(config);
  cloudformation = new CloudFormationClient(config);
  await rds.send(
    new CreateDBInstanceCommand({
      DBInstanceIdentifier: managedId,
      Engine: "postgres",
      DBInstanceClass: "db.t3.micro",
      AllocatedStorage: 20,
      MasterUsername: "postgres",
      ManageMasterUserPassword: true,
    }),
  );
});

test.afterAll(async () => {
  await cloudformation
    .send(new DeleteStackCommand({ StackName: stackName }))
    .catch(() => undefined);
  for (const id of [createdId, managedId]) {
    await rds
      .send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: id, SkipFinalSnapshot: true }))
      .catch(() => undefined);
  }
});

const runAction = async (page: Page, action: string) => {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action }).click();
};

const statusOf = async (id: string) =>
  (await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }))).DBInstances?.[0]
    ?.DBInstanceStatus;

test("creates a self-managed MySQL database with Easy create", async ({ page }) => {
  await page.goto("/rds/databases");
  await page.getByRole("link", { name: "Create database" }).click();

  await page.getByText("MySQL", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Master username" })).toHaveValue("admin");
  await page.getByRole("textbox", { name: "DB identifier" }).fill(createdId);
  await page.getByLabel("Master password", { exact: true }).fill("lc-e2e-password");
  await page.getByLabel("Confirm master password").fill("lc-e2e-password");
  await page.getByRole("textbox", { name: "Initial database name" }).fill("appdb");
  await page.getByRole("button", { name: "Create database" }).click();

  await expect(page).toHaveURL(new RegExp(`/rds/databases/${createdId}$`));
  await expect(page.getByRole("heading", { level: 1, name: createdId })).toBeVisible();
  await expect(page.getByText(/^localhost:70\d\d$/)).toBeVisible();
  // URL tách nhiều đoạn quanh <wbr> (BreakableText): so cả ô giá trị
  await expect(
    page.getByRole("definition").filter({ hasText: /mysql:\/\/admin@localhost:70\d\d\/appdb/ }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Node.js" })).toBeVisible();

  await page.getByRole("tab", { name: "Configuration" }).click();
  await expect(page).toHaveURL(/\?tab=configuration$/);
  await expect(page.getByText("Self managed")).toBeVisible();
  await expect(page.getByText("appdb")).toBeVisible();
});

test("stops, starts and reboots from Actions", async ({ page }) => {
  await page.goto(`/rds/databases/${createdId}`);

  await runAction(page, "Stop temporarily");
  await page.getByRole("dialog").getByRole("button", { name: "Stop temporarily" }).click();
  await expect(flash(page)).toContainText(`Stopping ${createdId}`);
  await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
  expect(await statusOf(createdId)).toBe("stopped");

  await runAction(page, "Start");
  await expect(page.getByText("Available", { exact: true })).toBeVisible();

  await runAction(page, "Reboot");
  await page.getByRole("dialog").getByRole("button", { name: "Reboot" }).click();
  await expect(flash(page)).toContainText(`Rebooting ${createdId}`);
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
});

test("links a managed database to its rds! secret", async ({ page }) => {
  await page.goto(`/rds/databases/${managedId}?tab=configuration`);
  await page.getByRole("link", { name: "Manage in Secrets Manager" }).click();

  await expect(page).toHaveURL(/\/secretsmanager\/secrets\/detail\?name=rds/);
  await expect(page.getByRole("heading", { level: 1, name: /^rds!db-/ })).toBeVisible();
});

test("deletes from the list after typing delete me", async ({ page }) => {
  await page.goto("/rds/databases");
  await page.getByRole("radio", { name: createdId }).check();
  await runAction(page, "Delete");

  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("delete me");
  await confirm.click();

  await expect(page.getByRole("link", { name: createdId })).toHaveCount(0);
});

test("links a database made by CloudFormation with its stack, both ways", async ({ page }) => {
  const template = {
    Resources: {
      Database: {
        Type: "AWS::RDS::DBInstance",
        Properties: {
          DBInstanceIdentifier: stackDatabaseId,
          Engine: "postgres",
          DBInstanceClass: "db.t3.micro",
          AllocatedStorage: "20",
          MasterUsername: "postgres",
          MasterUserPassword: "lc-e2e-password",
        },
      },
    },
  };
  await cloudformation.send(
    new CreateStackCommand({ StackName: stackName, TemplateBody: JSON.stringify(template) }),
  );
  await waitFor("stack to be created", async () => {
    const { Stacks = [] } = await cloudformation.send(
      new DescribeStacksCommand({ StackName: stackName }),
    );
    return Stacks[0]?.StackStatus === "CREATE_COMPLETE" ? true : undefined;
  });

  await page.goto(`/rds/databases/${stackDatabaseId}`);
  await page.getByRole("link", { name: stackName, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: stackName })).toBeVisible();

  await page.getByRole("tab", { name: /Resources/ }).click();
  await page.getByRole("link", { name: stackDatabaseId }).click();
  await expect(page).toHaveURL(new RegExp(`/rds/databases/${stackDatabaseId}$`));
});
