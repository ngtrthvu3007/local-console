import {
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DeleteQueueCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, setEditor, test, uniqueName } from "./fixtures.ts";

// Flow qua UI của bốn service: SQS (tạo queue) → S3 (bật EventBridge cho bucket) → EventBridge (rule
// bắt event aws.s3, target là queue) → upload → SQS (peek thấy event) → xóa queue → rule báo "not found".
// Resource dọn bằng SDK ở afterAll để test lỗi giữa chừng vẫn sạch.

const bucket = uniqueName("bucket");
const queue = uniqueName("queue");
const rule = uniqueName("rule");
const KEY = "reports/2026.csv";

test.describe.configure({ mode: "serial" });

let s3: S3Client;
let sqs: SQSClient;
let events: EventBridgeClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  sqs = new SQSClient(config);
  events = new EventBridgeClient(config);
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
});

test.afterAll(async () => {
  const { Targets = [] } = await events
    .send(new ListTargetsByRuleCommand({ Rule: rule }))
    .catch(() => ({ Targets: [] }));
  if (Targets.length)
    await events.send(new RemoveTargetsCommand({ Rule: rule, Ids: Targets.map((t) => t.Id!) }));
  await events.send(new DeleteRuleCommand({ Name: rule })).catch(() => {});
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: KEY })).catch(() => {});
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
  const { QueueUrl } = await sqs
    .send(new GetQueueUrlCommand({ QueueName: queue }))
    .catch(() => ({ QueueUrl: undefined }));
  if (QueueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

test("SQS: create the queue", async ({ page }) => {
  await page.goto("/sqs/queues/create");
  await page.getByRole("textbox", { name: "Name" }).fill(queue);
  await page.getByRole("button", { name: "Create queue" }).click();
  await expect(page).toHaveURL(new RegExp(`/sqs/queues/${queue}`));
});

test("S3: turn on Amazon EventBridge for the bucket", async ({ page }) => {
  await page.goto(`/s3/buckets/${bucket}?tab=properties`);
  const toggle = page.getByRole("checkbox", { name: "Off" });
  await expect(toggle).toBeVisible();
  // Toggle theo dữ liệu đã lưu (đổi sau khi Floci trả lời) nên dùng click, không dùng check()
  await toggle.click();
  await expect(flash(page).getByText("Turned on Amazon EventBridge for this bucket")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "On" })).toBeChecked();

  // Tải lại: cấu hình nằm ở Floci, không chỉ ở trạng thái trang
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "On" })).toBeChecked();
});

test("EventBridge: a rule for the bucket's events with the queue as its target", async ({
  page,
}) => {
  await page.goto("/eventbridge/rules/create");
  await page.getByPlaceholder("order-created").fill(rule);
  await setEditor(
    page,
    JSON.stringify({
      source: ["aws.s3"],
      "detail-type": ["Object Created"],
      detail: { bucket: { name: [bucket] } },
    }),
  );
  await page.getByRole("button", { name: "Create rule" }).last().click();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/rules/default/${rule}$`));

  await page.getByRole("button", { name: "Add target" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add target" });
  await dialog.getByRole("button", { name: /Type/ }).click();
  await page.getByRole("option", { name: "SQS", exact: true }).click();
  await dialog.getByRole("button", { name: /^SQS/ }).last().click();
  await page.getByRole("option", { name: queue }).click();
  await dialog.getByRole("button", { name: "Add target" }).click();
  await expect(flash(page).getByText("Added target")).toBeVisible();
});

test("an upload reaches the queue: SQS peek shows the S3 event", async ({ page }) => {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: "a,b" }));

  await page.goto(`/sqs/queues/${queue}`);
  const row = page.getByRole("row", { name: /aws.s3/ });
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(row).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test("turning EventBridge off warns about the rule, and Cancel keeps it on", async ({ page }) => {
  await page.goto(`/s3/buckets/${bucket}?tab=properties`);
  await page.getByRole("checkbox", { name: "On" }).click();
  const dialog = page.getByRole("dialog", { name: "Turn off Amazon EventBridge?" });
  await expect(dialog.getByText(new RegExp(`${rule} \\(bus default\\)`))).toBeVisible();
  await expect(dialog.getByText(/1 rule match events from this bucket/)).toBeVisible();

  // Hủy thì công tắc vẫn bật
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("checkbox", { name: "On" })).toBeChecked();

  // Đồng ý thì tắt thật (đọc lại từ Floci), rule vẫn còn nhưng không còn nhận event
  await page.getByRole("checkbox", { name: "On" }).click();
  await dialog.getByRole("button", { name: "Turn off" }).click();
  await expect(
    flash(page).getByText("Turned off Amazon EventBridge for this bucket"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Off" })).toBeVisible();
  // Tắt rồi thì không còn gì để cảnh báo: bật lại và tắt tiếp không hỏi nữa
  await page.getByRole("checkbox", { name: "Off" }).click();
  await expect(page.getByRole("checkbox", { name: "On" })).toBeChecked();
  await page.getByRole("checkbox", { name: "On" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("the queue's Settings tab lists the rule that sends to it", async ({ page }) => {
  await page.goto(`/sqs/queues/${queue}?tab=settings`);
  await expect(page.getByRole("heading", { name: /^EventBridge/ })).toBeVisible();
  await expect(page.getByRole("link", { name: rule })).toBeVisible();
});

test.describe("dangling reference", () => {
  test.use({ danglingProbes: true });

  test("deleting the queue warns about the rule, then the rule shows the target as not found", async ({
    page,
  }) => {
    await page.goto(`/sqs/queues/${queue}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Delete/ });
    await expect(
      dialog.getByText(new RegExp(`EventBridge rules or schedules still point at\\s+${queue}`)),
    ).toBeVisible();
    await dialog.getByRole("textbox").fill("delete");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/sqs\/queues$/);

    await page.goto(`/eventbridge/rules/default/${rule}`);
    await expect(page.getByText(`${queue} (not found)`)).toBeVisible();
  });
});
