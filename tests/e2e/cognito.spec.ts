import {
  CognitoIdentityProviderClient,
  DeleteUserPoolCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { choose, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của trang Cognito trên UI: tạo pool đăng nhập bằng email → app client mặc định → user mật khẩu tạm
// → Test sign-in bằng email → đặt mật khẩu mới → có token → xóa pool. Pool dọn bằng SDK ở afterAll để test lỗi
// giữa chừng vẫn sạch (pool này không có domain nên xóa thẳng được)

const pool = uniqueName("pool");
const client = uniqueName("client");
const email = `${uniqueName("user")}@example.com`;
const TEMPORARY_PASSWORD = "Temp-Passw0rd!";
const NEW_PASSWORD = "Fresh-Passw0rd!";
// Floci không trả NextToken cho ListUserPools: một trang tối đa là đủ
const LIST_POOLS_PAGE_SIZE = 60;

test.afterAll(async () => {
  const cognito = new CognitoIdentityProviderClient(viaConsole((await consoleConfig()).region));
  const { UserPools = [] } = await cognito
    .send(new ListUserPoolsCommand({ MaxResults: LIST_POOLS_PAGE_SIZE }))
    .catch(() => ({ UserPools: [] }));
  for (const { Id, Name } of UserPools)
    if (Name === pool)
      await cognito.send(new DeleteUserPoolCommand({ UserPoolId: Id })).catch(() => undefined);
});

test("sign in with a temporary password, set a new one, then delete the pool", async ({ page }) => {
  await page.goto("/cognito/user-pools");
  await page.getByRole("button", { name: "Create user pool" }).first().click();
  const createPool = page.getByRole("dialog");
  await createPool.getByRole("textbox", { name: "Name" }).fill(pool);
  await createPool.getByRole("radio", { name: "Email" }).check();
  await createPool.getByRole("button", { name: "Create", exact: true }).click();
  await expect(flash(page).getByText(`Created user pool ${pool}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: pool })).toBeVisible();
  const poolPath = new URL(page.url()).pathname;

  await page.getByRole("tab", { name: "App clients" }).click();
  await page.getByRole("link", { name: "Create app client" }).first().click();
  await page.getByRole("textbox", { name: "Name" }).fill(client);
  await page.getByRole("button", { name: "Create app client" }).click();
  await expect(flash(page).getByText(`Created app client ${client}`)).toBeVisible();

  await page.goto(poolPath);
  await page.getByRole("button", { name: "Create user" }).first().click();
  const createUser = page.getByRole("dialog");
  await createUser.getByRole("textbox", { name: "Email" }).fill(email);
  await createUser.getByLabel("Temporary password").fill(TEMPORARY_PASSWORD);
  await createUser.getByRole("button", { name: "Create user" }).click();
  await expect(flash(page).getByText(/^Created user /)).toBeVisible();
  await expect(page.getByText("Force change password")).toBeVisible();

  // Gõ email ở Username: console tự trả lời NEW_PASSWORD_REQUIRED bằng username nội bộ của Floci
  await page.getByRole("button", { name: "Test sign-in" }).click();
  const signIn = page.getByRole("dialog", { name: "Test sign-in" });
  await choose(page, signIn, /App client/, { name: new RegExp(client) });
  await signIn.getByRole("textbox", { name: "Username" }).fill(email);
  await signIn.getByLabel("Password").fill(TEMPORARY_PASSWORD);
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await signIn.getByLabel("New password").fill(NEW_PASSWORD);
  await signIn.getByRole("button", { name: "Set new password" }).click();
  await expect(signIn.getByText(/^Signed in · expires /)).toBeVisible();
  await expect(signIn.getByRole("tab", { name: "ID token" })).toBeVisible();
  await signIn.getByRole("button", { name: "Close" }).first().click();

  await page.getByRole("button", { name: "Delete" }).first().click();
  const deletePool = page.getByRole("dialog", { name: "Delete user pools" });
  await deletePool.getByPlaceholder("delete").fill("delete");
  await deletePool.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(flash(page).getByText("Deleted 1 user pool")).toBeVisible();
  await expect(page).toHaveURL(/\/cognito\/user-pools$/);
  await expect(page.getByRole("link", { name: pool })).toHaveCount(0);
});
