import {
  CloudFormationClient,
  CreateChangeSetCommand,
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, test, uniqueName } from "./fixtures.ts";

// Các trạng thái khó tạo ra thật: stack lồng nhau, stack chờ execute change set, stack đang chạy (giả lập
// bằng cách chặn DescribeStacks). Dọn bằng SDK ở afterAll.

const CHILD_KEY = "child.json";
const POLL_WAIT_MS = 6000;
const queueTemplate = (queue: string) =>
  JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Resources: { Queue: { Type: "AWS::SQS::Queue", Properties: { QueueName: queue } } },
  });

const parent = uniqueName("cfnparent");
const review = uniqueName("cfnreview");
const templates = uniqueName("tpl");
const queue = uniqueName("queue");

let cloudformation: CloudFormationClient;
let s3: S3Client;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  cloudformation = new CloudFormationClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  await s3.send(new CreateBucketCommand({ Bucket: templates }));
  await s3.send(
    new PutObjectCommand({ Bucket: templates, Key: CHILD_KEY, Body: queueTemplate(queue) }),
  );
  await cloudformation.send(
    new CreateStackCommand({
      StackName: parent,
      TemplateBody: JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          Child: {
            Type: "AWS::CloudFormation::Stack",
            Properties: { TemplateURL: `http://localhost:4566/${templates}/${CHILD_KEY}` },
          },
        },
      }),
    }),
  );
  await cloudformation.send(
    new CreateChangeSetCommand({
      StackName: review,
      ChangeSetName: "cs",
      ChangeSetType: "CREATE",
      TemplateBody: queueTemplate(uniqueName("reviewq")),
    }),
  );
});

test.afterAll(async () => {
  for (const name of [parent, review]) {
    await cloudformation.send(new DeleteStackCommand({ StackName: name })).catch(() => undefined);
  }
  await s3
    .send(new DeleteObjectCommand({ Bucket: templates, Key: CHILD_KEY }))
    .catch(() => undefined);
  await s3.send(new DeleteBucketCommand({ Bucket: templates })).catch(() => undefined);
});

test("a nested stack links to its child from Resources and Events", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${parent}?tab=resources`);
  await page.getByRole("link", { name: new RegExp(`stack/${parent}-Child`) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${parent}-Child`);

  // Events của stack cha: dòng Child link sang stack con, dòng của chính stack cha thì không
  await page.goto(`/cloudformation/stacks/${parent}`);
  await expect(page.getByRole("link", { name: "Child" }).first()).toBeVisible();
  await expect(
    page.getByRole("table").getByRole("link", { name: parent, exact: true }),
  ).toHaveCount(0);
});

test("a stack waiting for its change set explains why it is empty and is not polled", async ({
  page,
}) => {
  let describeCalls = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      (request.postData() ?? "").includes("Action=DescribeStacks")
    ) {
      describeCalls++;
    }
  });
  await page.goto(`/cloudformation/stacks/${review}`);
  await expect(page.getByText("REVIEW_IN_PROGRESS").first()).toBeVisible();
  await expect(page.getByText(/change set that nobody executed/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  const before = describeCalls;
  await page.waitForTimeout(POLL_WAIT_MS);
  expect(describeCalls, "no polling while waiting for a change set").toBe(before);
});

test("the list refreshes by itself while a stack runs, then stops", async ({ page }) => {
  const name = uniqueName("cfnrunning");
  let describeCalls = 0;
  const stackXml = (status: string) =>
    `<DescribeStacksResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/"><DescribeStacksResult><Stacks><member><StackName>${name}</StackName><StackId>arn:aws:cloudformation:ap-southeast-1:000000000000:stack/${name}/1</StackId><CreationTime>2026-01-01T00:00:00Z</CreationTime><StackStatus>${status}</StackStatus></member></Stacks></DescribeStacksResult><ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></DescribeStacksResponse>`;
  // Hai lần đầu đang chạy, sau đó xong
  await page.route("**/aws/", async (route) => {
    if (!(route.request().postData() ?? "").includes("Action=DescribeStacks"))
      return route.continue();
    describeCalls++;
    await route.fulfill({
      contentType: "text/xml",
      body: stackXml(describeCalls <= 2 ? "CREATE_IN_PROGRESS" : "CREATE_COMPLETE"),
    });
  });
  await page.goto("/cloudformation/stacks");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("CREATE_IN_PROGRESS");
  await expect(row).toContainText("CREATE_COMPLETE");
  const done = describeCalls;
  await page.waitForTimeout(POLL_WAIT_MS);
  expect(describeCalls, "polling stops once the stack is complete").toBe(done);
});
