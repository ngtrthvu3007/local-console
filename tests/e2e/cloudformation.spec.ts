import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính trên UI: danh sách → stack (cảnh báo stub) → Events → Resources → trang queue / bucket có "Stack: X" → Outputs → xóa.
// Dọn bằng SDK ở afterAll.

const stack = uniqueName("cfn");
const queue = uniqueName("queue");
const bucket = uniqueName("bucket");
const STUB_LOGICAL_ID = "StubbedDatabase";
const OUTPUT_KEY = "QueueName";

test.describe.configure({ mode: "serial" });

let cloudformation: CloudFormationClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  cloudformation = new CloudFormationClient(viaConsole(region));
  await cloudformation.send(
    new CreateStackCommand({
      StackName: stack,
      TemplateBody: JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Description: "lc-e2e cloudformation",
        Resources: {
          Queue: { Type: "AWS::SQS::Queue", Properties: { QueueName: queue } },
          Bucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: bucket } },
          [STUB_LOGICAL_ID]: {
            Type: "AWS::Glue::Database",
            Properties: { CatalogId: "000000000000", DatabaseInput: { Name: "lc_e2e_cfn_db" } },
          },
        },
        Outputs: { [OUTPUT_KEY]: { Value: { "Fn::GetAtt": ["Queue", "QueueName"] } } },
      }),
    }),
  );
});

test.afterAll(async () => {
  await cloudformation.send(new DeleteStackCommand({ StackName: stack })).catch(() => undefined);
});

test("find the stack in the list and open it", async ({ page }) => {
  await page.goto("/cloudformation/stacks");
  await page.getByRole("searchbox").fill(stack);
  const row = page.getByRole("row", { name: new RegExp(stack) });
  await expect(row).toContainText("CREATE_COMPLETE");
  await row.getByRole("link", { name: stack }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(stack);
  await expect(page.getByText("lc-e2e cloudformation")).toBeVisible();
  // Resource Glue bị Floci stub: cảnh báo đầu trang nêu đúng resource
  await expect(page.getByText(new RegExp(`stubbed by Floci.*${STUB_LOGICAL_ID}`))).toBeVisible();
});

test("events: newest first, failures only filters them out", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${stack}`);
  const events = page.getByRole("table").first();
  await expect(events.getByRole("row").nth(1)).toContainText("CREATE_COMPLETE");
  await page.getByText("Failures only").click();
  await expect(page.getByText("No events")).toBeVisible();
});

test("resources: stub badge, no link; queue links to the SQS page", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${stack}?tab=resources`);
  const stubbed = page.getByRole("row", { name: new RegExp(STUB_LOGICAL_ID) });
  await expect(stubbed).toContainText("Stubbed by Floci");
  await expect(stubbed.getByRole("link")).toHaveCount(0);

  await page.getByRole("link", { name: queue }).click();
  await expect(page).toHaveURL(new RegExp(`/sqs/queues/${queue}`));
  // Chờ trang queue tải xong (lazy): trước đó breadcrumb của trang stack còn trên màn hình, cũng tên stack
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(queue);
  // Trang queue nói queue thuộc stack nào, link quay về stack
  await page.getByRole("link", { name: stack }).click();
  await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${stack}`));
});

test("bucket page shows its stack", async ({ page }) => {
  await page.goto(`/s3/buckets/${bucket}`);
  await expect(page.getByRole("link", { name: stack })).toBeVisible();
});

test("outputs tab shows the output", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${stack}?tab=outputs`);
  const row = page.getByRole("row", { name: new RegExp(OUTPUT_KEY) });
  // Một lần, không lặp (CopyToClipboard inline đã hiện giá trị)
  await expect(row.getByText(queue)).toHaveCount(1);
});

test("delete the stack from its page", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${stack}`);
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/cloudformation\/stacks$/);
  await expect(flash(page)).toContainText(`Deleted stack ${stack}`);
  await page.getByRole("searchbox").fill(stack);
  await expect(page.getByRole("row", { name: new RegExp(stack) })).toHaveCount(0);
});

// Stack không có thì DescribeStacks trả 400: trình duyệt ghi console.error, nên cho phép riêng test này
test.describe("deleted stack", () => {
  test.use({ danglingProbes: true });

  test("its page says it was not found", async ({ page }) => {
    await page.goto(`/cloudformation/stacks/${stack}`);
    await expect(page.getByText(`Stack ${stack} not found`)).toBeVisible();
  });
});

// Bucket còn object / queue bị xóa tay thì DeleteStack lỗi: modal giữ nguyên, thông báo nêu lý do,
// stack ở lại với DELETE_FAILED và trang chi tiết chỉ cách gỡ từng resource
test.describe("delete a stack that cannot be deleted", () => {
  const stuck = uniqueName("cfnstuck");
  const stuckBucket = uniqueName("stuckbucket");
  const stuckQueue = uniqueName("stuckqueue");
  let s3: S3Client;
  let sqs: SQSClient;

  test.beforeAll(async () => {
    const { region } = await consoleConfig();
    s3 = new S3Client({ ...viaConsole(region), forcePathStyle: true });
    sqs = new SQSClient(viaConsole(region));
    await cloudformation.send(
      new CreateStackCommand({
        StackName: stuck,
        TemplateBody: JSON.stringify({
          AWSTemplateFormatVersion: "2010-09-09",
          Resources: {
            Bucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: stuckBucket } },
            Queue: { Type: "AWS::SQS::Queue", Properties: { QueueName: stuckQueue } },
          },
        }),
      }),
    );
    await s3.send(new PutObjectCommand({ Bucket: stuckBucket, Key: "keep.txt", Body: "x" }));
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: stuckQueue }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl }));
  });

  // Floci không bỏ qua resource đã mất: tạo lại queue cùng tên rồi mới xóa được stack
  test.afterAll(async () => {
    await s3
      .send(new DeleteObjectCommand({ Bucket: stuckBucket, Key: "keep.txt" }))
      .catch(() => undefined);
    await sqs.send(new CreateQueueCommand({ QueueName: stuckQueue })).catch(() => undefined);
    await cloudformation.send(new DeleteStackCommand({ StackName: stuck })).catch(() => undefined);
  });

  test("shows why it failed and keeps the stack", async ({ page }) => {
    await page.goto(`/cloudformation/stacks/${stuck}`);
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("delete");
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(flash(page)).toContainText(`Couldn't delete ${stuck}`);
    await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${stuck}`));
    await expect(page.getByText("DELETE_FAILED").first()).toBeVisible();

    const alert = page.getByRole("group").filter({ hasText: "delete the stack again" });
    await expect(alert).toContainText("same name");
    await expect(alert.getByRole("listitem").filter({ hasText: "not empty" })).toContainText(
      "Bucket",
    );
    await expect(alert.getByRole("listitem").filter({ hasText: "does not exist" })).toContainText(
      stuckQueue,
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await alert.getByRole("link", { name: stuckBucket }).click();
    await expect(page).toHaveURL(new RegExp(`/s3/buckets/${stuckBucket}`));
  });
});
