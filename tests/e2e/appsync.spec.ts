import type { Page } from "@playwright/test";
import {
  AppSyncClient,
  DeleteGraphqlApiCommand,
  paginateListGraphqlApis,
} from "@aws-sdk/client-appsync";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { choose, confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của AppSync trên UI (spec AppSync 3, 8): tạo API → sửa schema → data source DynamoDB →
// resolver JS → Queries ghi rồi đọc → bật IAM, query lại bằng IAM qua proxy → tạo API key → xóa API

const apiName = uniqueName("appsync");
const table = uniqueName("appsync");
const TITLE = "xin chào";
// IAM là auth phụ: type và field phải có @aws_iam (luật AppSync)
const SCHEMA = `type Todo @aws_api_key @aws_iam { id: ID! title: String }
type Query { getTodo(id: ID!): Todo @aws_api_key @aws_iam listTodos: [Todo] }
type Mutation { addTodo(id: ID!, title: String): Todo }`;
const PUT_ITEM = `import { util } from "@aws-appsync/utils";
export function request(ctx) {
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: ctx.args.id }),
    attributeValues: util.dynamodb.toMapValues({ title: ctx.args.title }),
  };
}
export function response(ctx) { return ctx.result; }`;

test.describe.configure({ mode: "serial" });

let config: ReturnType<typeof viaConsole>;
let apiPath = "";

// Ace: chọn hết rồi gõ đè
async function replaceCode(page: Page, text: string, index = 0) {
  await page.locator(".ace_text-input").nth(index).focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

async function runQuery(page: Page, query: string) {
  await replaceCode(page, query);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("heading", { name: "Response" })).toBeVisible();
  return page.getByLabel("Code", { exact: true }).last();
}

async function attachResolver(page: Page, field: string) {
  await page.goto(apiPath);
  await page.getByRole("radio", { name: new RegExp(field) }).click();
  await page.getByRole("button", { name: "Attach resolver" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`Resolver .*${field}`) }),
  ).toBeVisible();
}

test.beforeAll(async () => {
  config = viaConsole((await consoleConfig()).region);
  await new DynamoDBClient(config).send(
    new CreateTableCommand({
      TableName: table,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
});

test.afterAll(async () => {
  const appsync = new AppSyncClient(config);
  for await (const page of paginateListGraphqlApis({ client: appsync }, {})) {
    for (const api of page.graphqlApis ?? []) {
      if (api.name === apiName)
        await appsync.send(new DeleteGraphqlApiCommand({ apiId: api.apiId }));
    }
  }
  await new DynamoDBClient(config)
    .send(new DeleteTableCommand({ TableName: table }))
    .catch(() => undefined);
});

test("creates an API that already has a sample schema", async ({ page }) => {
  await page.goto("/appsync/apis/create");
  await page.getByRole("textbox", { name: "Name" }).fill(apiName);
  await page.getByRole("button", { name: "Create API" }).last().click();

  await expect(flash(page)).toContainText(`Created API ${apiName}`);
  apiPath = new URL(page.url()).pathname;
  await expect(page.getByRole("radio", { name: /addTodo/ })).toBeVisible();
});

test("saves an edited schema and lists its fields", async ({ page }) => {
  await page.goto(apiPath);
  await expect(page.getByRole("radio", { name: /getTodo/ })).toBeVisible();
  await replaceCode(page, SCHEMA);
  await page.getByRole("button", { name: "Save schema" }).click();

  await expect(flash(page)).toContainText("Saved schema");
  await expect(page.getByRole("radio", { name: /listTodos/ })).toBeVisible();
});

// Review 2026-11-25: đổi tab không được làm mất schema chưa lưu; rời trang thì hỏi lại
test("keeps an unsaved schema across tabs and asks before leaving", async ({ page }) => {
  await page.goto(apiPath);
  await expect(page.getByRole("radio", { name: /listTodos/ })).toBeVisible();
  await replaceCode(page, `${SCHEMA}\n# draft`);
  await page.getByRole("tab", { name: "Data sources" }).click();
  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.locator(".ace_content").first()).toContainText("# draft");

  await page.getByRole("link", { name: "APIs", exact: true }).click();
  const leave = page.getByRole("dialog");
  await expect(leave).toContainText("Leave this page?");
  await leave.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/appsync\/apis$/);
});

test("connects a DynamoDB table as a data source", async ({ page }) => {
  await page.goto(`${apiPath}?tab=data-sources`);
  await page.getByRole("button", { name: "Create data source" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill("todos");
  await choose(page, dialog, /Table/, { name: table });
  await dialog.getByRole("button", { name: "Create data source" }).click();

  await expect(flash(page)).toContainText("Saved data source todos");
  await expect(page.getByRole("link", { name: table })).toBeVisible();
});

test("attaches JS resolvers that read and write the table", async ({ page }) => {
  await attachResolver(page, "getTodo");
  // Mẫu GetItem theo id của data source DynamoDB đầu tiên
  await page.getByRole("button", { name: "Save" }).click();
  await expect(flash(page)).toContainText("Saved resolver Query.getTodo");

  await attachResolver(page, "addTodo");
  await replaceCode(page, PUT_ITEM);
  // Rời trang resolver khi còn code chưa lưu: hỏi lại, ở lại thì code vẫn còn
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(flash(page)).toContainText("Saved resolver Mutation.addTodo");

  await page.goto(`${apiPath}?tab=queries`);
  await runQuery(page, `mutation { addTodo(id: "1", title: "${TITLE}") { id } }`);
  const response = await runQuery(page, '{ getTodo(id: "1") { title } }');
  await expect(response).toContainText(TITLE);
});

test("queries with IAM through the console proxy", async ({ page }) => {
  await page.goto(`${apiPath}?tab=settings`);
  await page.getByRole("button", { name: "Edit" }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /Additional authorization/, { name: "AWS IAM" });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page)).toContainText("Saved authorization");

  await page.goto(`${apiPath}?tab=queries`);
  await choose(page, page.locator("body"), /Authorization/, { name: "AWS IAM" });
  const response = await runQuery(page, '{ getTodo(id: "1") { title } }');
  await expect(response).toContainText(TITLE);
});

test("creates an API key, then deletes the API", async ({ page }) => {
  await page.goto(`${apiPath}?tab=settings`);
  await page.getByRole("button", { name: "Create API key" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create API key" }).click();
  await expect(flash(page)).toContainText("Created API key");

  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(page).toHaveURL(/\/appsync\/apis$/);
});
