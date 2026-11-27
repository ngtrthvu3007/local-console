import type { Page } from "@playwright/test";
import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  DeleteLogGroupCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
  KinesisClient,
} from "@aws-sdk/client-kinesis";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { consoleConfig, createTestFunction, viaConsole, waitFor } from "../it/helpers.ts";
import { LAMBDA_ROLE, confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của CloudWatch Logs trên UI (spec mục 8): tạo group, retention, test event, Search,
// stream, subscription filter tới Lambda và Kinesis, link qua lại với Lambda, xóa

const group = `/${uniqueName("logs")}`;
const receiver = uniqueName("logs-fn");
const stream = uniqueName("logs-stream");
const receiverGroup = `/aws/lambda/${receiver}`;
// Group mở khi chưa có rồi mới tạo; group tạo lúc đặt retention lỗi
const later = `/${uniqueName("logs-later")}`;
const partial = `/${uniqueName("logs-partial")}`;
const JSON_EVENT = JSON.stringify({ level: "ERROR", code: 500 });
// Lambda đích giải nén event.awslogs.data rồi in từng message
const RECEIVER_SOURCE = `
import { gunzipSync } from "node:zlib";
export const handler = async (event) => {
  const data = JSON.parse(gunzipSync(Buffer.from(event.awslogs.data, "base64")).toString());
  for (const logEvent of data.logEvents) console.log("got " + logEvent.message);
};
`;

test.describe.configure({ mode: "serial" });

let config: ReturnType<typeof viaConsole>;

test.beforeAll(async () => {
  config = viaConsole((await consoleConfig()).region);
  const lambda = new LambdaClient(config);
  await createTestFunction(lambda, { name: receiver, source: RECEIVER_SOURCE, role: LAMBDA_ROLE });
  const kinesis = new KinesisClient({ ...config, requestHandler: new NodeHttpHandler() });
  await kinesis.send(new CreateStreamCommand({ StreamName: stream, ShardCount: 1 }));
  await waitFor("stream to be ready", async () => {
    const { StreamDescriptionSummary } = await kinesis.send(
      new DescribeStreamSummaryCommand({ StreamName: stream }),
    );
    return StreamDescriptionSummary?.StreamStatus === "ACTIVE" ? true : undefined;
  });
});

test.afterAll(async () => {
  const logs = new CloudWatchLogsClient(config);
  for (const name of [group, receiverGroup, later, partial])
    await logs.send(new DeleteLogGroupCommand({ logGroupName: name })).catch(() => undefined);
  await new LambdaClient(config)
    .send(new DeleteFunctionCommand({ FunctionName: receiver }))
    .catch(() => undefined);
  await new KinesisClient({ ...config, requestHandler: new NodeHttpHandler() })
    .send(new DeleteStreamCommand({ StreamName: stream }))
    .catch(() => undefined);
});

const groupPage = (tab?: string) =>
  `/logs/groups/detail?${new URLSearchParams({ group, ...(tab ? { tab } : {}) })}`;

async function sendTestEvent(page: Page, message: string) {
  await page.getByRole("button", { name: "Send test event" }).click();
  const dialog = page.getByRole("dialog", { name: "Send test event" });
  await dialog.getByRole("textbox", { name: "Message" }).fill(message);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog).toBeHidden();
}

async function createFilter(page: Page, name: string, type: string, destination: string) {
  await page.goto(groupPage("subscription-filters"));
  await page.getByRole("tabpanel").getByRole("button", { name: "Create" }).click();
  const dialog = page.getByRole("dialog", { name: "Create subscription filter" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("textbox", { name: /Filter pattern/ }).fill("ERROR");
  await dialog.getByRole("radio", { name: type }).check();
  await dialog.getByRole("button", { name: new RegExp(type) }).click();
  await page.getByRole("option", { name: destination }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

test("blocks a log group name with a space", async ({ page }) => {
  await page.goto("/logs/groups");
  await page.getByRole("button", { name: "Create log group" }).first().click();
  const name = page.getByRole("dialog").getByRole("textbox", { name: "Name" });
  await name.fill("has space");
  await page.getByRole("dialog").getByRole("button", { name: "Create log group" }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
});

test("creates a log group with retention and changes it to never expire", async ({ page }) => {
  await page.goto("/logs/groups");
  await page.getByRole("button", { name: "Create log group" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(group);
  await dialog.getByRole("button", { name: /Retention/ }).click();
  await page.getByRole("option", { name: "7 days", exact: true }).click();
  await dialog.getByRole("button", { name: "Create log group" }).click();

  await expect(page).toHaveURL(groupPage());
  await expect(flash(page)).toContainText(`Created log group ${group}`);
  await expect(page.getByText("Retention: 7 days")).toBeVisible();

  await page.getByRole("button", { name: "Edit retention" }).click();
  const edit = page.getByRole("dialog", { name: "Edit retention" });
  await edit.getByRole("button", { name: /Retention/ }).click();
  await page.getByRole("option", { name: "Never expire" }).click();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Retention: Never expire")).toBeVisible();
});

test("finds test events by text and JSON patterns, and opens their stream", async ({ page }) => {
  await page.goto(groupPage());
  await sendTestEvent(page, "ERROR boom");
  await sendTestEvent(page, JSON_EVENT);
  await expect(page.getByText("Log events (2)")).toBeVisible();

  await page.getByRole("searchbox").fill('{ $.level = "ERROR" }');
  await expect(page.getByText("Log events (1)")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: JSON_EVENT })).toBeVisible();

  await page.getByRole("tab", { name: "Log streams" }).click();
  await page.getByRole("link", { name: "console-test" }).click();
  await expect(page.getByText("Log events (2)")).toBeVisible();
  await expect(page.getByText("ERROR boom")).toBeVisible();

  // Hết event cũ thì nút biến mất, không gửi token rỗng (Floci trả 400)
  const older = page.getByRole("button", { name: "Load older events" });
  await older.click();
  await expect(older).toBeHidden();
  await expect(page.getByText("Log events (2)")).toBeVisible();
});

test("shows the three filter pattern styles next to the filter", async ({ page }) => {
  await page.goto(groupPage());
  for (const example of ["?WARN ?ERROR", '{ $.level = "ERROR" }', "[ip, method, status=5*]"])
    await expect(page.getByText(example, { exact: false }).first()).toBeVisible();
});

test("an empty stream has no older events to load", async ({ page }) => {
  await new CloudWatchLogsClient(config).send(
    new CreateLogStreamCommand({ logGroupName: group, logStreamName: "empty" }),
  );
  await page.goto(`/logs/groups/stream?${new URLSearchParams({ group, stream: "empty" })}`);
  await expect(page.getByText("No events in this stream")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load older events" })).toHaveCount(0);
});

// Log lặp trong cùng 1 ms (vòng lặp console.log) vẫn hiện đủ từng dòng
test("shows identical events written in the same millisecond", async ({ page }) => {
  const logs = new CloudWatchLogsClient(config);
  await logs.send(new CreateLogStreamCommand({ logGroupName: group, logStreamName: "dupes" }));
  const timestamp = Date.now();
  await logs.send(
    new PutLogEventsCommand({
      logGroupName: group,
      logStreamName: "dupes",
      logEvents: [
        { timestamp, message: "retrying" },
        { timestamp, message: "retrying" },
        { timestamp, message: "retrying" },
      ],
    }),
  );
  await page.goto(`/logs/groups/stream?${new URLSearchParams({ group, stream: "dupes" })}`);
  await expect(page.getByText("Log events (3)")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "retrying" })).toHaveCount(3);
});

test("delivers matching events to a Lambda subscription filter", async ({ page }) => {
  await createFilter(page, "errors-to-lambda", "Lambda function", receiver);
  await expect(page.getByRole("link", { name: receiver })).toHaveAttribute(
    "href",
    `/lambda/functions/${receiver}`,
  );
  await sendTestEvent(page, "ERROR to lambda");

  const logs = new CloudWatchLogsClient(config);
  await waitFor("receiver to log the event", async () => {
    const { events = [] } = await logs
      .send(new FilterLogEventsCommand({ logGroupName: receiverGroup, filterPattern: '"got"' }))
      .catch(() => ({ events: [] }));
    return events.some((event) => event.message?.includes("ERROR to lambda")) ? true : undefined;
  });

  // Lambda › Monitor → log group của function, và ngược lại
  await page.goto(`/lambda/functions/${receiver}?tab=monitor`);
  await page.getByRole("link", { name: "View in CloudWatch Logs" }).click();
  await expect(page.getByRole("heading", { level: 1, name: receiverGroup })).toBeVisible();
  await expect(page.getByText("got ERROR to lambda")).toBeVisible();
  await page.getByRole("link", { name: receiver, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lambda/functions/${receiver}$`));
});

test("delivers matching events to Kinesis and the Data viewer decompresses them", async ({
  page,
}) => {
  await createFilter(page, "errors-to-stream", "Kinesis stream", stream);
  await sendTestEvent(page, "ERROR to kinesis");

  await page.goto(`/kinesis/streams/${stream}`);
  // Bảng chỉ hiện đầu record: thấy JSON (không phải "Binary"), mở record để thấy cả message
  await expect(async () => {
    await page.getByRole("button", { name: "Get records" }).click();
    await expect(page.getByText(/"messageType":"DATA_MESSAGE"/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page
    .getByRole("row", { name: /DATA_MESSAGE/ })
    .getByRole("link")
    .click();
  await expect(page.getByText(/ERROR to kinesis/).first()).toBeVisible();
  await expect(page.getByText(/^Binary/)).toHaveCount(0);
});

test("deletes the subscription filters and the log group", async ({ page }) => {
  await page.goto(groupPage("subscription-filters"));
  await page.getByRole("checkbox", { name: "Select all subscription filters" }).check();
  await page.getByRole("tabpanel").getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(page.getByText("No subscription filters")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).first().click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(page).toHaveURL(/\/logs\/groups$/);
  await expect(page.getByRole("link", { name: group, exact: true })).toHaveCount(0);

  // Quay lại trang của group vừa xóa: báo not found, các tab không gọi API cho group đã mất (400)
  await page.goBack();
  await expect(page.getByText(`Log group ${group} not found`)).toBeVisible();
});

async function createGroup(page: Page, name: string, retention?: string) {
  await page.getByRole("button", { name: "Create log group" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  if (retention) {
    await dialog.getByRole("button", { name: /Retention/ }).click();
    await page.getByRole("option", { name: retention, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Create log group" }).click();
}

// Đã mở trang group khi nó chưa có (link từ service khác), rồi tạo: không nháy "not found" từ cache cũ
test("opens a group created after its page said not found without flashing not found", async ({
  page,
}) => {
  await page.goto(`/logs/groups/detail?${new URLSearchParams({ group: later })}`);
  await expect(page.getByText(`Log group ${later} not found`)).toBeVisible();
  await page.getByRole("link", { name: "View log groups" }).click();
  // Ghi lại nếu chữ "not found" xuất hiện lúc chuyển sang trang group vừa tạo
  await page.evaluate(() => {
    const flags = window as unknown as { sawNotFound: boolean };
    flags.sawNotFound = false;
    new MutationObserver(() => {
      if (document.body.innerText.includes("not found")) flags.sawNotFound = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await createGroup(page, later);
  await expect(page.getByRole("heading", { level: 1, name: later })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { sawNotFound: boolean }).sawNotFound),
  ).toBe(false);
});

// Không gọi API theo tên trước khi biết có: không có request 400 / console.error
test("shows a missing group and a missing stream as not found", async ({ page }) => {
  const missing = `/${uniqueName("logs-missing")}`;
  await page.goto(`/logs/groups/detail?${new URLSearchParams({ group: missing })}`);
  await expect(page.getByText(`Log group ${missing} not found`)).toBeVisible();
  await page.goto(
    `/logs/groups/stream?${new URLSearchParams({ group: receiverGroup, stream: "nope" })}`,
  );
  await expect(page.getByText("Log stream nope not found")).toBeVisible();
});

// Floci lỗi khi đang mở trang stream: hiện lỗi kèm Retry thay vì quay spinner mãi
test.describe("when Floci fails", () => {
  // Request cố ý trả 400: trình duyệt ghi console.error, đúng mong đợi
  test.use({ danglingProbes: true });

  // Group đã tạo mà đặt retention lỗi: vẫn mở group, báo đúng bước lỗi
  test("opens the group and names the retention step when setting retention fails", async ({
    page,
  }) => {
    await page.route("**/aws/", (route) =>
      route.request().headers()["x-amz-target"]?.endsWith("PutRetentionPolicy")
        ? route.fulfill({
            status: 400,
            contentType: "application/x-amz-json-1.1",
            body: JSON.stringify({ __type: "InvalidParameterException", message: "boom" }),
          })
        : route.continue(),
    );
    await page.goto("/logs/groups");
    await createGroup(page, partial, "7 days");
    await expect(page.getByRole("heading", { level: 1, name: partial })).toBeVisible();
    await expect(flash(page)).toContainText(`Couldn't set retention of ${partial}`);
  });

  test("shows an error with Retry on the stream page", async ({ page }) => {
    await page.route("**/aws/", (route) =>
      route.request().headers()["x-amz-target"]?.endsWith("DescribeLogGroups")
        ? route.fulfill({
            status: 400,
            contentType: "application/x-amz-json-1.1",
            body: JSON.stringify({ __type: "ServiceUnavailableException", message: "boom" }),
          })
        : route.continue(),
    );
    await page.goto(`/logs/groups/stream?${new URLSearchParams({ group: "/any", stream: "x" })}`);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 30_000 });
  });
});
