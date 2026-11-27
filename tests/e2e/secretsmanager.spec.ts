import type { Page } from "@playwright/test";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  RotateSecretCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  FUNCTION_TIMEOUT_SECONDS,
  ROTATION_LAMBDA_SOURCE,
  consoleConfig,
  createTestFunction,
  viaConsole,
} from "../it/helpers.ts";
import { LAMBDA_ROLE, choose, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của Secrets Manager trên UI. Tên có "/" để kiểm ?name=. Dọn bằng SDK ở afterAll
// (ForceDeleteWithoutRecovery: secret chờ xóa vẫn giữ tên)

const keyValueSecret = `${uniqueName("secret")}/app`;
const plaintextSecret = uniqueName("plain");
const doomedSecret = uniqueName("doomed");

test.describe.configure({ mode: "serial" });

let secrets: SecretsManagerClient;

test.beforeAll(async () => {
  secrets = new SecretsManagerClient(viaConsole((await consoleConfig()).region));
  await secrets.send(new CreateSecretCommand({ Name: doomedSecret, SecretString: "x" }));
});

test.afterAll(async () => {
  for (const name of [keyValueSecret, plaintextSecret, doomedSecret]) {
    await secrets
      .send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }))
      .catch(() => undefined);
  }
});

const secretValue = async (name: string) =>
  (await secrets.send(new GetSecretValueCommand({ SecretId: name }))).SecretString;

test("creates a key/value secret and opens it", async ({ page }) => {
  await page.goto("/secretsmanager/secrets");
  await expect(page.getByRole("link", { name: "Secrets", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Store a new secret" }).click();

  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByRole("textbox", { name: "Key", exact: true }).nth(0).fill("username");
  await page.getByRole("textbox", { name: "Value", exact: true }).nth(0).fill("app");
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByRole("textbox", { name: "Key", exact: true }).nth(1).fill("password");
  await page.getByRole("textbox", { name: "Value", exact: true }).nth(1).fill("p1");
  await page.getByRole("textbox", { name: "Secret name" }).fill(keyValueSecret);
  await page.getByRole("textbox", { name: "Description" }).fill("DB credentials");
  await page.getByRole("button", { name: "Store secret" }).click();

  await expect(page).toHaveURL(/\/secretsmanager\/secrets\/detail\?name=/);
  await expect(page.getByRole("heading", { level: 1, name: keyValueSecret })).toBeVisible();
  expect(JSON.parse((await secretValue(keyValueSecret)) ?? "")).toEqual({
    username: "app",
    password: "p1",
  });
});

test("creates a plaintext secret", async ({ page }) => {
  await page.goto("/secretsmanager/secrets/create");
  await page.getByText("Plaintext", { exact: true }).click();
  await page.locator(".ace_text-input").focus();
  await page.keyboard.insertText("token-123");
  await page.getByRole("textbox", { name: "Secret name" }).fill(plaintextSecret);
  await page.getByRole("button", { name: "Store secret" }).click();

  await expect(page.getByRole("heading", { level: 1, name: plaintextSecret })).toBeVisible();
  expect(await secretValue(plaintextSecret)).toBe("token-123");
});

test("rejects a name with spaces before calling Secrets Manager", async ({ page }) => {
  await page.goto("/secretsmanager/secrets/create");
  await page.getByRole("textbox", { name: "Secret name" }).fill("has space");
  await page.getByRole("button", { name: "Store secret" }).click();
  await expect(page.getByText("Use only letters, numbers and / _ + = . @ -")).toBeVisible();
});

test("lists secrets and deletes one with a recovery window", async ({ page }) => {
  await page.goto("/secretsmanager/secrets");
  const row = page.getByRole("row").filter({ hasText: keyValueSecret });
  await expect(row).toContainText("DB credentials");

  await page.getByRole("row").filter({ hasText: doomedSecret }).getByRole("radio").check();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "The secret is hidden and can't be read until the window ends.",
  );
  await expect(dialog).toContainText("7 days");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(flash(page)).toContainText(`Scheduled ${doomedSecret} for deletion`);
  await expect(page.getByRole("row").filter({ hasText: doomedSecret })).toHaveCount(0);
  const { DeletedDate } = await secrets.send(new DescribeSecretCommand({ SecretId: doomedSecret }));
  expect(DeletedDate).toBeDefined();

  // Link cũ tới secret đang chờ xóa: không mở như secret còn dùng được
  await page.goto(`/secretsmanager/secrets/detail?${new URLSearchParams({ name: doomedSecret })}`);
  await expect(page.getByText(`Secret ${doomedSecret} not found`)).toBeVisible();
  await expect(page.getByText("It's scheduled for deletion.")).toBeVisible();
});

test.describe("errors from Secrets Manager", () => {
  test.use({ danglingProbes: true });

  test("a name already in use shows the error and keeps the form", async ({ page }) => {
    await page.goto("/secretsmanager/secrets/create");
    await page.getByText("Plaintext", { exact: true }).click();
    await page.locator(".ace_text-input").focus();
    await page.keyboard.insertText("again");
    await page.getByRole("textbox", { name: "Secret name" }).fill(plaintextSecret);
    await page.getByRole("button", { name: "Store secret" }).click();

    await expect(flash(page)).toContainText(`Couldn't store ${plaintextSecret}`);
    await expect(page).toHaveURL(/\/secretsmanager\/secrets\/create/);
  });
});

// Trang chi tiết: secret seed bằng SDK để không phụ thuộc test tạo ở trên
test.describe("secret detail", () => {
  const credentials = `${uniqueName("creds")}/db`;
  const numeric = uniqueName("numeric");
  const NUMERIC_VALUE = '{"port": 5432}';

  test.beforeAll(async () => {
    await secrets.send(
      new CreateSecretCommand({
        Name: credentials,
        SecretString: JSON.stringify({ username: "app", password: "p1" }),
        Description: "DB credentials",
      }),
    );
    await secrets.send(new CreateSecretCommand({ Name: numeric, SecretString: NUMERIC_VALUE }));
  });

  test.afterAll(async () => {
    for (const name of [credentials, numeric]) {
      await secrets
        .send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }))
        .catch(() => undefined);
    }
  });

  const open = (page: Page, name: string) =>
    page.goto(`/secretsmanager/secrets/detail?${new URLSearchParams({ name })}`);

  test("retrieves the value only when asked", async ({ page }) => {
    const valueRequests: string[] = [];
    page.on("request", (request) => {
      if (request.headers()["x-amz-target"]?.endsWith("GetSecretValue"))
        valueRequests.push(request.url());
    });

    await open(page, credentials);
    await expect(page.getByRole("heading", { level: 1, name: credentials })).toBeVisible();
    await expect(page.getByText("arn:aws:secretsmanager:")).toBeVisible();
    await expect(page.getByText("p1", { exact: true })).toHaveCount(0);
    expect(valueRequests).toEqual([]);

    await page.getByRole("button", { name: "Retrieve secret value" }).click();
    await expect(page.getByText("p1", { exact: true })).toBeVisible();
    expect(valueRequests).toHaveLength(1);
  });

  test("edits a key/value secret", async ({ page }) => {
    await open(page, credentials);
    await page.getByRole("button", { name: "Retrieve secret value" }).click();
    await page.getByRole("button", { name: "Edit value" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Value", exact: true }).nth(1).fill("p2");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("p2", { exact: true })).toBeVisible();
    expect(JSON.parse((await secretValue(credentials)) ?? "")).toEqual({
      username: "app",
      password: "p2",
    });
  });

  test("a value that isn't flat key/value is edited as plaintext and kept as typed", async ({
    page,
  }) => {
    await open(page, numeric);
    await page.getByRole("button", { name: "Retrieve secret value" }).click();
    await expect(page.getByText(NUMERIC_VALUE)).toBeVisible();
    await expect(page.getByRole("radio", { name: "Key/value" })).toHaveCount(0);

    await page.getByRole("button", { name: "Edit value" }).click();
    await page.getByRole("dialog").locator(".ace_text-input").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText('{"port": 6543}');
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();

    await expect(page.getByText('{"port": 6543}')).toBeVisible();
    expect(await secretValue(numeric)).toBe('{"port": 6543}');
  });

  test("edits the description", async ({ page }) => {
    await open(page, credentials);
    await page.getByRole("button", { name: "Edit description" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Description" }).fill("Main DB");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Main DB")).toBeVisible();
  });

  test("deletes from the detail page and goes back to the list", async ({ page }) => {
    await open(page, numeric);
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("delete");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/secretsmanager\/secrets$/);
  });

  test.describe("missing secret", () => {
    test.use({ danglingProbes: true });

    test("an unknown secret shows not found", async ({ page }) => {
      await open(page, "lc-e2e-missing");
      await expect(page.getByText("Secret lc-e2e-missing not found")).toBeVisible();
      await expect(page.getByRole("link", { name: "View secrets" })).toBeVisible();
    });
  });
});

// Lambda thứ hai luôn lỗi: kiểm console chỉ báo "chạy nền"
const BROKEN_SOURCE = `export const handler = async () => { throw new Error("lc-e2e broken rotation"); };`;

test.describe("rotation", () => {
  const rotating = uniqueName("rotating");
  const brokenSecret = uniqueName("brokenrot");
  const rotateFunction = uniqueName("rotate");
  const brokenFunction = uniqueName("brokenfn");
  let lambda: LambdaClient;
  let brokenArn: string;

  const createFunction = async (name: string, source: string) =>
    (
      await createTestFunction(lambda, {
        name,
        source,
        role: LAMBDA_ROLE,
        timeout: FUNCTION_TIMEOUT_SECONDS,
      })
    ).arn;

  test.beforeAll(async () => {
    lambda = new LambdaClient(viaConsole((await consoleConfig()).region));
    await createFunction(rotateFunction, ROTATION_LAMBDA_SOURCE);
    brokenArn = await createFunction(brokenFunction, BROKEN_SOURCE);
    await secrets.send(new CreateSecretCommand({ Name: rotating, SecretString: "before" }));
    await secrets.send(new CreateSecretCommand({ Name: brokenSecret, SecretString: "same" }));
    await secrets.send(
      new RotateSecretCommand({
        SecretId: brokenSecret,
        RotationLambdaARN: brokenArn,
        RotationRules: { ScheduleExpression: "rate(1 days)" },
        RotateImmediately: false,
      }),
    );
  });

  test.afterAll(async () => {
    for (const name of [rotating, brokenSecret]) {
      await secrets
        .send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }))
        .catch(() => undefined);
    }
    for (const name of [rotateFunction, brokenFunction]) {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: name })).catch(() => undefined);
    }
  });

  const open = (page: Page, name: string) =>
    page.goto(`/secretsmanager/secrets/detail?${new URLSearchParams({ name })}`);

  test("rotate now is disabled until a function is set", async ({ page }) => {
    await open(page, rotating);
    await expect(page.getByRole("button", { name: "Rotate secret immediately" })).toBeDisabled();
  });

  test("turns on rotation with a function and a schedule", async ({ page }) => {
    await open(page, rotating);
    await page.getByRole("button", { name: "Edit rotation" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Automatic rotation" }).check();
    await choose(page, dialog, /Rotation function/, { name: rotateFunction });
    await dialog.getByRole("spinbutton", { name: "Days" }).fill("1");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
    await expect(page.getByText("rate(1 days)")).toBeVisible();
    await expect(page.getByRole("link", { name: rotateFunction })).toHaveAttribute(
      "href",
      new RegExp(`/lambda/functions/${rotateFunction}\\?tab=monitor`),
    );
    // Lưu cấu hình không xoay giá trị (Floci chỉ gọi testSecret, spec 7 #3)
    expect(await secretValue(rotating)).toBe("before");
  });

  test("rotates now and the value changes", async ({ page }) => {
    await open(page, rotating);
    await page.getByRole("button", { name: "Rotate secret immediately" }).click();
    await expect(flash(page)).toContainText("Rotation started in the background.");
    await expect(flash(page).getByRole("link", { name: "View Lambda logs" })).toBeVisible();

    await expect.poll(() => secretValue(rotating), { timeout: 60_000 }).toMatch(/^rotated-/);
    await page.reload();
    await expect(
      page.getByText("Last rotated", { exact: true }).locator("xpath=../.."),
    ).toContainText(/\d{4}-\d{2}-\d{2}/);
  });

  test("a failing rotation function only shows the background notice", async ({ page }) => {
    await open(page, brokenSecret);
    await page.getByRole("button", { name: "Rotate secret immediately" }).click();
    await expect(flash(page)).toContainText("Rotation started in the background.");
    await expect(flash(page)).not.toContainText("Couldn't");
  });

  test("the rotation function lists the secret and warns before it is deleted", async ({
    page,
  }) => {
    // Tab Triggers cũng có nút Delete (xóa trigger): mở modal xóa function từ tab mặc định
    await page.goto(`/lambda/functions/${brokenFunction}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Secrets Manager rotates/)).toContainText(brokenSecret);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/lambda/functions/${brokenFunction}?tab=triggers`);
    const row = page.getByRole("row").filter({ hasText: brokenSecret });
    await expect(row).toContainText("Secrets Manager");
    await expect(row).toContainText("Rotation");
    await row.getByRole("link", { name: brokenSecret }).click();
    await expect(page.getByRole("heading", { level: 1, name: brokenSecret })).toBeVisible();
  });

  test("turns rotation off", async ({ page }) => {
    await open(page, rotating);
    await page.getByRole("button", { name: "Edit rotation" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Automatic rotation" }).uncheck();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
  });
});
