import type { Page } from "@playwright/test";
import {
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { DeleteQueueCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng nối SQS với service khác, đi trên UI như dev: SQS → Lambda, Lambda ↔ SQS, S3 → SQS,
// và luồng lỗi poll → DLQ → redrive. Resource dọn bằng SDK ở afterAll để test lỗi giữa chừng vẫn sạch.

const functionName = uniqueName("fn");
const triggerQueue = uniqueName("queue");
const dlq = uniqueName("dlq");
const s3Queue = uniqueName("s3q");
const fifoQueue = `${uniqueName("fifo")}.fifo`;
const bucket = uniqueName("bucket");
const MARKER = "LC_E2E_SQS_TO_LAMBDA";
const UPLOAD_NAME = "invoice.txt";

test.describe.configure({ mode: "serial" });

async function createQueue(page: Page, name: string, fifo = false) {
  await page.goto("/sqs/queues/create");
  if (fifo) await page.getByRole("radio", { name: /FIFO/ }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("button", { name: "Create queue" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

// Editor là Ace: gõ vào textarea ẩn của nó
async function sendMessage(page: Page, queue: string, body: string) {
  await page.goto(`/sqs/queues/${queue}`);
  await page.getByRole("button", { name: "Send message" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator(".ace_text-input").focus();
  await page.keyboard.type(body);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(flash(page).getByText(/^Sent message /)).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
}

test.afterAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  const lambda = new LambdaClient(config);
  const sqs = new SQSClient(config);
  const s3 = new S3Client({ ...config, forcePathStyle: true });
  const ignore = () => undefined;

  const { EventSourceMappings = [] } = await lambda
    .send(new ListEventSourceMappingsCommand({ FunctionName: functionName }))
    .catch(() => ({ EventSourceMappings: [] }));
  for (const { UUID } of EventSourceMappings)
    await lambda.send(new DeleteEventSourceMappingCommand({ UUID })).catch(ignore);
  await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName })).catch(ignore);

  for (const QueueName of [triggerQueue, dlq, s3Queue, fifoQueue]) {
    const url = await sqs
      .send(new GetQueueUrlCommand({ QueueName }))
      .then((result) => result.QueueUrl)
      .catch(ignore);
    if (url) await sqs.send(new DeleteQueueCommand({ QueueUrl: url })).catch(ignore);
  }

  const { Contents = [] } = await s3
    .send(new ListObjectsV2Command({ Bucket: bucket }))
    .catch(() => ({ Contents: [] }));
  if (Contents.length)
    await s3
      .send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: Contents.map(({ Key }) => ({ Key })) },
        }),
      )
      .catch(ignore);
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(ignore);
});

test("add a Lambda trigger from the queue page and see the message in the function logs", async ({
  page,
}) => {
  await page.goto("/lambda/functions/create");
  await page.getByRole("textbox", { name: "Function name" }).fill(functionName);
  await page.getByRole("button", { name: "Create function" }).click();
  await expect(page.getByRole("heading", { level: 1, name: functionName })).toBeVisible();

  await createQueue(page, triggerQueue);
  await page.getByRole("tab", { name: "Lambda triggers" }).click();
  await page.getByRole("button", { name: "Add trigger" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Function/ }).click();
  await page.getByRole("option", { name: new RegExp(functionName) }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    flash(page).getByText(`${functionName} now runs when messages arrive`),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(functionName) })).toContainText("Enabled");

  await sendMessage(page, triggerQueue, `{"marker": "${MARKER}"}`);
  // Lambda chạy thật trong container: lần đầu khởi động có thể mất vài giây
  await page.goto(`/lambda/functions/${functionName}?tab=monitor`);
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(MARKER).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
});

test("Lambda triggers link back to the queue, and Add trigger lists queues", async ({ page }) => {
  await page.goto(`/lambda/functions/${functionName}?tab=triggers`);
  await page.getByRole("button", { name: "Add trigger" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "SQS" }).click();
  await dialog.getByRole("button", { name: /^Queue/ }).click();
  await expect(page.getByRole("option", { name: new RegExp(triggerQueue) })).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("link", { name: triggerQueue, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sqs/queues/${triggerQueue}$`));
});

test("S3 sends object events to a chosen queue; FIFO queues are locked", async ({ page }) => {
  await createQueue(page, s3Queue);
  await createQueue(page, fifoQueue, true);

  await page.goto("/s3/buckets/create");
  await page.getByRole("textbox", { name: "Bucket name" }).fill(bucket);
  await page.getByRole("button", { name: "Create bucket" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bucket })).toBeVisible();

  await page.goto(`/s3/buckets/${bucket}?tab=properties`);
  await page.getByRole("button", { name: "Create event notification" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "SQS queue" }).click();
  await dialog.getByRole("button", { name: /^Queue/ }).click();
  await expect(page.getByRole("option", { name: new RegExp(fifoQueue) })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("option", { name: new RegExp(s3Queue) }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText("Created event notification")).toBeVisible();

  await page.goto(`/s3/buckets/${bucket}/upload`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: UPLOAD_NAME, mimeType: "text/plain", buffer: Buffer.from("e2e") });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();

  // Tên queue ở cột Destination là link sang trang queue; peek thấy event của file vừa upload
  // (bảng chỉ hiện 80 ký tự đầu của body, nên tìm theo eventSource)
  await page.goto(`/s3/buckets/${bucket}?tab=properties`);
  await page.getByRole("link", { name: s3Queue, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sqs/queues/${s3Queue}$`));
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("row", { name: /"eventSource":"aws:s3"/ })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
});

test("failed messages move to the DLQ and redrive back", async ({ page }) => {
  await createQueue(page, dlq);
  const source = s3Queue; // đã có message của S3, dùng tiếp làm queue nguồn
  await page.goto(`/sqs/queues/${source}?tab=settings`);

  // Visibility 1 giây để message poll mà không xóa quay lại ngay
  await page.getByRole("button", { name: "Edit" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Visibility timeout" }).fill("1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Edit" }).nth(1).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Turn on dead-letter queue" }).check();
  await dialog.getByRole("button", { name: /^Dead-letter queue/ }).click();
  await page.getByRole("option", { name: dlq, exact: true }).click();
  await dialog.getByRole("textbox", { name: "Maximum receives" }).fill("1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("tab", { name: "Messages" }).click();
  await page.getByRole("button", { name: "Poll for messages" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/After 1 receive they move to the DLQ/)).toBeVisible();
  // Lần poll sau khi hết visibility: message đã nhận đủ số lần thì sang DLQ, poll rỗng
  await expect(async () => {
    await dialog.getByRole("button", { name: "Poll again" }).click();
    await expect(dialog.getByText("No messages available")).toBeVisible({ timeout: 8_000 });
  }).toPass({ timeout: 40_000 });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.goto(`/sqs/queues/${dlq}`);
  await page.getByRole("button", { name: "Start DLQ redrive" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(source);
  await dialog.getByRole("button", { name: "Start redrive" }).click();
  await expect(flash(page).getByText(`Started moving messages from ${dlq}`)).toBeVisible();

  await page.goto(`/sqs/queues/${source}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("row", { name: /"eventSource":"aws:s3"/ })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
});
