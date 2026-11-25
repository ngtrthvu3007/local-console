import type { Page } from "@playwright/test";
import {
  CreateAliasCommand,
  CreateKeyCommand,
  DeleteAliasCommand,
  KMSClient,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import { DeleteBucketCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { DeleteDBInstanceCommand, RDSClient } from "@aws-sdk/client-rds";
import { DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import { strToU8, zipSync } from "fflate";
import { DeleteQueueCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DeleteParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, expect, flash, test, uniqueName } from "./fixtures.ts";

// Chọn key KMS khi tạo resource ở service khác, rồi thấy link sang trang key (spec KMS 3.6).
// Một key có alias tạo bằng SDK dùng chung cho mọi test

const alias = `alias/${uniqueName("kmsint")}`;
const secretName = uniqueName("kmssecret");
const parameterName = `/${uniqueName("kmsparam")}/password`;
const bucket = uniqueName("kmsbucket");
const objectKey = "note.txt";
const queueName = uniqueName("kmsqueue");
const plainQueueName = uniqueName("kmsplainq");
const topicName = uniqueName("kmstopic");
const tableName = uniqueName("kmstable");
const functionName = uniqueName("kmsfn");
const databaseId = uniqueName("kmsdb");
const MIN_PENDING_DAYS = 7;

test.describe.configure({ mode: "serial" });

let kms: KMSClient;
let config: ReturnType<typeof viaConsole>;
let keyId = "";

test.beforeAll(async () => {
  config = viaConsole((await consoleConfig()).region);
  kms = new KMSClient(config);
  const { KeyMetadata } = await kms.send(
    new CreateKeyCommand({ Description: uniqueName("kmsint") }),
  );
  keyId = KeyMetadata?.KeyId ?? "";
  await kms.send(new CreateAliasCommand({ AliasName: alias, TargetKeyId: keyId }));
});

test.afterAll(async () => {
  await new SecretsManagerClient(config)
    .send(new DeleteSecretCommand({ SecretId: secretName, ForceDeleteWithoutRecovery: true }))
    .catch(() => undefined);
  await new SSMClient(config)
    .send(new DeleteParameterCommand({ Name: parameterName }))
    .catch(() => undefined);
  const s3 = new S3Client({ ...config, forcePathStyle: true });
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })).catch(() => undefined);
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
  const sqs = new SQSClient(config);
  await sqs
    .send(new GetQueueUrlCommand({ QueueName: queueName }))
    .then(({ QueueUrl }) => sqs.send(new DeleteQueueCommand({ QueueUrl })))
    .catch(() => undefined);
  await sqs
    .send(new GetQueueUrlCommand({ QueueName: plainQueueName }))
    .then(({ QueueUrl }) => sqs.send(new DeleteQueueCommand({ QueueUrl })))
    .catch(() => undefined);
  await new SNSClient(config)
    .send(
      new DeleteTopicCommand({
        TopicArn: `arn:aws:sns:${config.region}:000000000000:${topicName}`,
      }),
    )
    .catch(() => undefined);
  await new DynamoDBClient(config)
    .send(new DeleteTableCommand({ TableName: tableName }))
    .catch(() => undefined);
  await new LambdaClient(config)
    .send(new DeleteFunctionCommand({ FunctionName: functionName }))
    .catch(() => undefined);
  await new RDSClient(config)
    .send(
      new DeleteDBInstanceCommand({ DBInstanceIdentifier: databaseId, SkipFinalSnapshot: true }),
    )
    .catch(() => undefined);
  await kms.send(new DeleteAliasCommand({ AliasName: alias })).catch(() => undefined);
  await kms.send(
    new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: MIN_PENDING_DAYS }),
  );
});

// Ô chọn key là Select của Cloudscape: mở theo nhãn field rồi chọn alias
const chooseKey = (page: Page, field: RegExp) =>
  choose(page, page.locator("body"), field, { name: alias });

// Resource lưu ARN key nên link mang key ID; mở ra là trang key có alias
async function followKeyLink(page: Page) {
  await page.getByRole("link", { name: keyId }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${alias} (${keyId})`);
}

test("a secret stored with a chosen key links to it", async ({ page }) => {
  await page.goto("/secretsmanager/secrets/create");
  await page.getByText("Plaintext", { exact: true }).click();
  await page.getByRole("textbox", { name: "Secret name" }).fill(secretName);
  await page.locator(".ace_text-input").fill("s3cret");
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Store secret" }).click();

  await expect(flash(page)).toContainText(`Stored secret ${secretName}`);
  await followKeyLink(page);
});

test("a SecureString created with a chosen key links to it", async ({ page }) => {
  await page.goto("/ssm/parameters/create");
  await page.getByRole("textbox", { name: "Name" }).fill(parameterName);
  await page.getByText("SecureString", { exact: true }).click();
  await page.getByRole("textbox", { name: "Value" }).fill("s3cret");
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Create parameter" }).click();

  await expect(flash(page)).toContainText(`Created parameter ${parameterName}`);
  await followKeyLink(page);
});

test("a bucket with SSE-KMS default encryption links to its key", async ({ page }) => {
  await page.goto("/s3/buckets/create");
  await page.getByRole("textbox", { name: "Bucket name" }).fill(bucket);
  await page.getByText("SSE-KMS", { exact: true }).click();
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Create bucket" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bucket })).toBeVisible();

  await page.goto(`/s3/buckets/${bucket}?tab=properties`);
  await expect(page.getByText("SSE-KMS").first()).toBeVisible();
  await followKeyLink(page);
});

test("an object uploaded with a chosen key links to it", async ({ page }) => {
  await page.goto(`/s3/buckets/${bucket}/upload`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: objectKey,
      mimeType: "text/plain",
      buffer: Buffer.from("xin chào"),
    });
  await page.getByText("SSE-KMS", { exact: true }).click();
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();

  await page.goto(`/s3/buckets/${bucket}`);
  await page.getByRole("link", { name: objectKey }).click();
  await followKeyLink(page);
});

test("a queue with SSE-KMS links to its key", async ({ page }) => {
  await page.goto("/sqs/queues/create");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(queueName);
  await page.getByText("SSE-KMS", { exact: true }).click();
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Create queue" }).click();
  await expect(flash(page)).toContainText(`Created queue ${queueName}`);

  await page.getByRole("tab", { name: "Settings" }).click();
  await followKeyLink(page);
});

test("an encrypted topic links to its key", async ({ page }) => {
  await page.goto("/sns/topics/create");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(topicName);
  await page.getByText("Encrypt messages with a KMS key").click();
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Create topic" }).click();
  await expect(flash(page)).toContainText(topicName);

  // Trang topic mở ở tab Subscriptions; mã hóa nằm ở tab Details
  await page.getByRole("tab", { name: "Details" }).click();
  await followKeyLink(page);
});

test("a table encrypted with a customer key links to it", async ({ page }) => {
  await page.goto("/dynamodb/tables/create");
  await page.getByRole("textbox", { name: "Table name" }).fill(tableName);
  await page.getByRole("textbox", { name: "Partition key name" }).fill("pk");
  await page.getByText("Customer managed key", { exact: true }).click();
  await chooseKey(page, /Encryption key/);
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByRole("heading", { level: 1, name: tableName })).toBeVisible();

  await page.getByRole("tab", { name: "Settings" }).click();
  await followKeyLink(page);
});

test("a function's environment encryption key links to it", async ({ page }) => {
  const lambda = new LambdaClient(config);
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-lambda`,
      Code: { ZipFile: zipSync({ "index.mjs": strToU8("export const handler = async () => 1;") }) },
    }),
  );
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    return Configuration?.State === "Active" ? true : undefined;
  });

  await page.goto(`/lambda/functions/${functionName}?tab=configuration`);
  // Tab Configuration có hai nút Edit: lấy nút của khối Environment variables
  await page
    .getByRole("heading", { name: "Environment variables" })
    .locator("xpath=ancestor::*[.//button][1]")
    .getByRole("button", { name: "Edit" })
    .click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /Encryption key/, { name: alias });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await followKeyLink(page);
});

test("a database with encrypted storage links to its key", async ({ page }) => {
  await page.goto("/rds/databases/create");
  await page.getByRole("textbox", { name: "DB identifier" }).fill(databaseId);
  await page.getByText("Managed in AWS Secrets Manager").click();
  await page.getByText("Encrypt storage").click();
  await chooseKey(page, /^Encryption key/);
  await page.getByRole("button", { name: "Create database" }).click();
  // Floci tạo DB đồng bộ: trả về khi container chạy (lần đầu kéo image lâu hơn)
  await expect(page.getByRole("heading", { level: 1, name: databaseId })).toBeVisible({
    timeout: 180_000,
  });

  await page.getByRole("tab", { name: "Configuration" }).click();
  await followKeyLink(page);
});

// Review 2026-11-25: ARN gõ dở rồi đổi sang lựa chọn không dùng KMS thì form vẫn phải gửi được
test("a key typed then hidden doesn't block creating the queue", async ({ page }) => {
  await page.goto("/sqs/queues/create");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(plainQueueName);
  await page.getByText("SSE-KMS", { exact: true }).click();
  await choose(page, page.locator("body"), /Encryption key/, { name: "Enter a key ARN" });
  await page.getByPlaceholder(/arn:aws:kms:/).fill("abc");
  await page.getByText("SSE-SQS", { exact: true }).click();
  await page.getByRole("button", { name: "Create queue" }).click();

  await expect(flash(page)).toContainText(`Created queue ${plainQueueName}`);
});
