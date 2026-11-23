import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { strToU8, zipSync } from "fflate";
import { ACCOUNT_ID, consoleConfig, deleteMails, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, expect, test, uniqueName } from "./fixtures.ts";

// Cognito nối với Lambda (trigger) và SES (mail mời): đặt trigger trên UI, thấy nó ở trang function,
// trigger chặn user, mail mời vào SES Mailbox, function bị xóa thì pool báo not found.
// Các test nối tiếp nhau trên cùng một pool và function

const fn = uniqueName("presignup");
const pool = uniqueName("pool");
const okEmail = `${uniqueName("user")}@example.com`;
const BLOCKED_EMAIL = "blocked@example.com";
const BLOCKED_MESSAGE = "Blocked by pre sign-up";
const TEMPORARY_PASSWORD = "Temp-Passw0rd!";

// Chặn email bắt đầu bằng "blocked", còn lại cho qua
const HANDLER = `export const handler = async (event) => {
  if ((event.request.userAttributes.email ?? "").startsWith("blocked")) throw new Error("${BLOCKED_MESSAGE}");
  return event;
};`;

let lambda: LambdaClient;
let cognito: CognitoIdentityProviderClient;
let poolId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  lambda = new LambdaClient(config);
  cognito = new CognitoIdentityProviderClient(config);

  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: fn,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-lambda`,
      Code: { ZipFile: zipSync({ "index.mjs": strToU8(HANDLER) }) },
    }),
  );

  await waitFor(`${fn} to be Active`, async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: fn }));

    return Configuration?.State === "Active" ? true : undefined;
  });

  const created = await cognito.send(
    new CreateUserPoolCommand({
      PoolName: pool,
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
    }),
  );

  poolId = created.UserPool?.Id ?? "";
});

test.afterAll(async () => {
  await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId })).catch(() => undefined);
  await lambda.send(new DeleteFunctionCommand({ FunctionName: fn })).catch(() => undefined);

  // Mail mời nằm lại trong hộp thư SES của Floci nếu không xóa
  await deleteMails((mail) => mail.Destination?.ToAddresses?.includes(okEmail) ?? false);
});

test("a Pre sign-up trigger set on the pool shows on the function page and links back", async ({
  page,
}) => {
  await page.goto(`/cognito/user-pools/${poolId}?tab=triggers`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /Pre sign-up/, { name: fn });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: fn })).toBeVisible();

  const { UserPool } = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
  expect(UserPool?.LambdaConfig?.PreSignUp).toMatch(new RegExp(`:function:${fn}$`));

  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  const row = page.getByRole("row").filter({ hasText: pool });
  await expect(row).toContainText("Cognito");
  await expect(row).toContainText("Pre sign-up");
  await row.getByRole("link", { name: pool }).click();
  await expect(page).toHaveURL(new RegExp(`/cognito/user-pools/${poolId}\\?tab=triggers`));
});

test.describe("errors the trigger causes", () => {
  // Trigger chặn user và function bị xóa đều làm request tới /aws/ trả 400 / 404
  test.use({ danglingProbes: true });

  test("the trigger rejects a user in the form; an accepted user's invitation is in the SES mailbox", async ({
    page,
  }) => {
    await page.goto(`/cognito/user-pools/${poolId}`);
    await page.getByRole("button", { name: "Create user" }).first().click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Email" }).fill(BLOCKED_EMAIL);
    await dialog.getByRole("textbox", { name: "Temporary password" }).fill(TEMPORARY_PASSWORD);
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText(BLOCKED_MESSAGE).first()).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Create user" }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Email" }).fill(okEmail);
    await dialog.getByRole("textbox", { name: "Temporary password" }).fill(TEMPORARY_PASSWORD);
    await dialog.getByLabel(/Send invitation/).check();
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog).toBeHidden();

    const { Users = [] } = await cognito.send(new ListUsersCommand({ UserPoolId: poolId }));
    expect(Users).toHaveLength(1);

    await page.goto(
      `/cognito/user-pools/${poolId}/users/${encodeURIComponent(Users[0]?.Username ?? "")}`,
    );

    await page.getByRole("link", { name: "View emails" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/ses/mailbox\\?search=${encodeURIComponent(okEmail)}`),
    );

    await expect(page.getByText(okEmail).first()).toBeVisible();
  });

  test("a deleted trigger function shows as not found on the pool", async ({ page }) => {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: fn }));
    await page.goto(`/cognito/user-pools/${poolId}?tab=triggers`);
    await expect(page.getByText(`${fn} (not found)`)).toBeVisible();
  });
});
