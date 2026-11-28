import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Page } from "@playwright/test";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Tạo / sửa stack từ template YAML trên console (spec CloudFormation 3.6).
// Stack nào test tạo ra đều xóa trong afterAll; tên lc-e2e-* để leftovers dọn nếu sót

const created = uniqueName("tpl");
const existing = uniqueName("tpl-existing");
const cdkStack = uniqueName("tpl-cdk");
const bootstrapStack = uniqueName("tpl-bootstrap");
const jsonStack = uniqueName("tpl-json");
const failed = uniqueName("tpl-failed");
const recreated = uniqueName("tpl-recreated");
const leftDuring = uniqueName("tpl-left");

const TWO_QUEUES = `Resources:
  Queue:
    Type: AWS::SQS::Queue
  SecondQueue:
    Type: AWS::SQS::Queue
`;

const PARAMETER_WITHOUT_DEFAULT = `Parameters:
  QueueName:
    Type: String
Resources:
  Queue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Ref QueueName
`;

const BAD_YAML = "Resources: [\n  Queue: {";
// Thời gian worker kiểm cú pháp của Ace cần để báo lỗi / warning
const WORKER_SETTLE_MS = 2500;
// Đủ lâu để rời trang trước khi CreateStack trả lời
const DEPLOY_DELAY_MS = 2000;

let cloudformation: CloudFormationClient;
let sqs: SQSClient;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  cloudformation = new CloudFormationClient(config);
  sqs = new SQSClient(config);
  const queueTemplate = JSON.stringify({ Resources: { Queue: { Type: "AWS::SQS::Queue" } } });

  // Floci chạy CreateStack đồng bộ: xong lệnh là stack đã ở trạng thái cuối
  await cloudformation.send(
    new CreateStackCommand({ StackName: existing, TemplateBody: queueTemplate }),
  );

  await cloudformation.send(
    new CreateStackCommand({ StackName: jsonStack, TemplateBody: queueTemplate }),
  );

  await cloudformation.send(
    new CreateStackCommand({
      StackName: cdkStack,
      TemplateBody: JSON.stringify({
        Resources: {
          Queue: { Type: "AWS::SQS::Queue" },
          CDKMetadata: { Type: "AWS::CDK::Metadata", Properties: { Analytics: "v2:deflate64:x" } },
        },
      }),
    }),
  );
});

test.afterAll(async () => {
  for (const StackName of [
    created,
    existing,
    cdkStack,
    bootstrapStack,
    jsonStack,
    failed,
    recreated,
    leftDuring,
  ])
    await cloudformation.send(new DeleteStackCommand({ StackName })).catch(() => undefined);
});

// Ace tự thụt lề khi gõ Enter: chèn cả khối như dán
async function setTemplate(page: Page, text: string) {
  const editor = page.locator(".ace_text-input");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(text);
}

const resourceTypes = async (stack: string) =>
  (
    (await cloudformation.send(new ListStackResourcesCommand({ StackName: stack })))
      .StackResourceSummaries ?? []
  ).map((resource) => `${resource.ResourceType} ${resource.ResourceStatus}`);

// Hỏi thẳng SQS, không tin trạng thái của CloudFormation: queue phải có thật
async function queuesExist(stack: string) {
  const { StackResourceSummaries = [] } = await cloudformation.send(
    new ListStackResourcesCommand({ StackName: stack }),
  );

  const urls = StackResourceSummaries.filter(
    (resource) => resource.ResourceType === "AWS::SQS::Queue",
  ).map((resource) => resource.PhysicalResourceId ?? "");

  return Promise.all(
    urls.map((url) =>
      sqs.send(new GetQueueUrlCommand({ QueueName: url.split("/").pop() })).then(
        () => true,
        () => false,
      ),
    ),
  );
}

test("create a stack from the starter template, then see it in Events and the queue exists", async ({
  page,
}) => {
  await page.goto("/cloudformation/stacks");
  await page.getByRole("link", { name: "Create stack" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Create stack" })).toBeVisible();
  await expect(page.locator(".ace_content")).toContainText("AWS::SQS::Queue");
  await page.getByRole("textbox", { name: "Stack name" }).fill(created);
  await page.getByRole("button", { name: "Deploy" }).click();

  await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${created}$`));
  await expect(flash(page).getByText(`Deployed stack ${created}`)).toBeVisible();

  await expect(
    page.getByRole("row", { name: new RegExp(`${created}.*CREATE_COMPLETE`) }),
  ).toBeVisible();

  expect(await resourceTypes(created)).toEqual(["AWS::SQS::Queue CREATE_COMPLETE"]);
  expect(await queuesExist(created)).toEqual([true]);
});

test("edit the template: add a resource and deploy an update", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${created}`);
  await page.getByRole("link", { name: "Edit template" }).click();
  await expect(page.locator(".ace_content")).toContainText("AWS::SQS::Queue");

  await expect(
    page.getByText("Deploying this stack again from a file replaces changes made here."),
  ).toBeVisible();

  await setTemplate(page, TWO_QUEUES);
  await page.getByRole("button", { name: "Deploy" }).click();

  await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${created}$`));

  await expect(
    page.getByRole("row", { name: new RegExp(`${created}.*UPDATE_COMPLETE`) }).first(),
  ).toBeVisible();

  expect(await resourceTypes(created)).toHaveLength(2);
  expect(await queuesExist(created)).toEqual([true, true]);
});

test("the starter template opens without warnings", async ({ page }) => {
  await page.goto("/cloudformation/stacks/create/template");
  await expect(page.locator(".ace_content")).toContainText("!Ref Queue");

  // Ace không hiểu tag của CloudFormation (!Ref, !Sub…) nên không được báo warning.
  // Worker kiểm cú pháp chạy bất đồng bộ: chờ một nhịp rồi mới đọc số warning
  const warnings = page.getByRole("tab", { name: /^Warnings:/ });
  await expect(warnings).toBeVisible();
  await page.waitForTimeout(WORKER_SETTLE_MS);
  await expect(warnings).toHaveAccessibleName("Warnings: 0");
});

test("the editor has no print margin line", async ({ page }) => {
  await page.goto("/cloudformation/stacks/create/template");
  await expect(page.locator(".ace_content")).toContainText("!Ref Queue");

  // Vạch cột 80 của Ace: theme tối vẽ thành một đường sáng cắt ngang chữ
  await expect(page.locator(".ace_print-margin")).toBeHidden();
});

test("after deleting and creating a stack again, Edit template shows the new template", async ({
  page,
}) => {
  await cloudformation.send(
    new CreateStackCommand({ StackName: recreated, TemplateBody: TWO_QUEUES }),
  );

  // Đi hết bằng UI, không tải lại trang: template cũ còn trong cache của trang
  await page.goto(`/cloudformation/stacks/${recreated}/edit`);
  await expect(page.locator(".ace_content")).toContainText("SecondQueue");
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/cloudformation\/stacks$/);

  await page.getByRole("link", { name: "Create stack" }).first().click();
  await page.getByRole("textbox", { name: "Stack name" }).fill(recreated);
  await page.getByRole("button", { name: "Deploy" }).click();
  await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${recreated}$`));

  await page.getByRole("link", { name: "Edit template" }).click();
  await expect(page.locator(".ace_content")).toContainText("!Ref Queue");
  await expect(page.locator(".ace_content")).not.toContainText("SecondQueue");
});

test.describe("errors from Floci", () => {
  // Floci trả 400 cho update không đổi gì, template sai, tên đã có, stack không tồn tại
  test.use({ danglingProbes: true });

  test("deploying again with no change shows a notice and stays", async ({ page }) => {
    await page.goto(`/cloudformation/stacks/${created}/edit`);
    await expect(page.locator(".ace_content")).toContainText("SecondQueue");
    await page.getByRole("button", { name: "Deploy" }).click();

    await expect(flash(page).getByText("No changes to deploy.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${created}/edit$`));
  });

  // keep: chữ chỉ có trong template đã nhập, để chắc editor không bị reset về template mẫu
  for (const { title, name, template, message, keep } of [
    {
      title: "bad YAML",
      name: failed,
      template: BAD_YAML,
      message: /YAML not well-formed/,
      keep: "Queue: {",
    },
    {
      title: "an existing name",
      name: existing,
      template: TWO_QUEUES,
      message: /already exists/,
      keep: "SecondQueue",
    },
    {
      title: "a parameter without a default",
      name: failed,
      template: PARAMETER_WITHOUT_DEFAULT,
      message: /Parameters: \[QueueName\] must have values/,
      keep: "Type: String",
    },
  ])
    test(`${title} shows the error under the editor and keeps the text`, async ({ page }) => {
      await page.goto("/cloudformation/stacks/create/template");
      await page.getByRole("textbox", { name: "Stack name" }).fill(name);
      await setTemplate(page, template);
      await page.getByRole("button", { name: "Deploy" }).click();

      await expect(page.getByText(message)).toBeVisible();
      await expect(page).toHaveURL(/\/cloudformation\/stacks\/create\/template$/);
      await expect(page.locator(".ace_content")).toContainText(keep);
    });

  test("editing a stack that does not exist says not found", async ({ page }) => {
    await page.goto(`/cloudformation/stacks/${uniqueName("missing")}/edit`);
    await expect(page.getByText(/not found/)).toBeVisible();
    await expect(page.getByRole("link", { name: "View stacks" })).toBeVisible();
  });
});

test("a CDK stack cannot be edited here", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${cdkStack}`);
  // Nút có href nên Cloudscape vẽ thành link; bị khóa thì mang aria-disabled
  const edit = page.getByRole("link", { name: "Edit template" });
  await expect(edit).toHaveAttribute("aria-disabled", "true");
  await expect(edit).toHaveAccessibleDescription(/Deployed by CDK: edit it in your CDK app/);
});

test("the CDK bootstrap stack (no CDK::Metadata, a BootstrapVersion output) cannot be edited here", async ({
  page,
}) => {
  await cloudformation.send(
    new CreateStackCommand({
      StackName: bootstrapStack,
      TemplateBody: JSON.stringify({
        Resources: { Queue: { Type: "AWS::SQS::Queue" } },
        Outputs: { BootstrapVersion: { Value: "30" } },
      }),
    }),
  );

  await page.goto(`/cloudformation/stacks/${bootstrapStack}`);
  const edit = page.getByRole("link", { name: "Edit template" });
  await expect(edit).toHaveAttribute("aria-disabled", "true");
  await expect(edit).toHaveAccessibleDescription(/Deployed by CDK: edit it in your CDK app/);
});

test("opening Edit of a CDK stack by its URL explains why and cannot deploy", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${cdkStack}/edit`);
  await expect(page.locator(".ace_content")).toContainText("AWS::CDK::Metadata");
  await expect(page.getByText(/Deployed by CDK: edit it in your CDK app/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Deploy" })).toBeDisabled();
});

test("leaving the page while deploying still says when the stack is ready", async ({ page }) => {
  // CreateStack của Floci xong ngay: giữ request lại để kịp rời trang
  await page.route("**/aws/**", async (route) => {
    if (route.request().postData()?.includes("Action=CreateStack"))
      await new Promise((resolve) => setTimeout(resolve, DEPLOY_DELAY_MS));
    await route.continue();
  });

  await page.goto("/cloudformation/stacks/create/template");
  await page.getByRole("textbox", { name: "Stack name" }).fill(leftDuring);
  await page.getByRole("button", { name: "Deploy" }).click();
  await page.getByRole("link", { name: "Stacks", exact: true }).first().click();

  await expect(page).toHaveURL(/\/cloudformation\/stacks$/);
  await expect(flash(page).getByText(`Deployed stack ${leftDuring}`)).toBeVisible();
});

test("a stack deployed from a JSON file can be edited", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${jsonStack}/edit`);
  await expect(page.locator(".ace_content")).toContainText("AWS::SQS::Queue");
  await setTemplate(page, TWO_QUEUES);
  await page.getByRole("button", { name: "Deploy" }).click();

  await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${jsonStack}$`));
  expect(await resourceTypes(jsonStack)).toHaveLength(2);
});
