import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  EventBridgeClient,
} from "@aws-sdk/client-eventbridge";
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Edge case của EventBridge: Floci trả danh sách rỗng (không báo lỗi) cho bus / group không có,
// rule theo lịch chỉ có trên bus default

const bus = uniqueName("bus");
const missing = uniqueName("missing");
const schedule = uniqueName("sched");
const queue = uniqueName("queue");
// Trình duyệt chỉ liệt kê Asia/Saigon, không có tên này
const ALIAS_TIMEZONE = "Asia/Ho_Chi_Minh";

let events: EventBridgeClient;
let scheduler: SchedulerClient;
let sqs: SQSClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  events = new EventBridgeClient(viaConsole(region));
  scheduler = new SchedulerClient(viaConsole(region));
  sqs = new SQSClient(viaConsole(region));
  await events.send(new CreateEventBusCommand({ Name: bus }));
  const url = (await sqs.send(new CreateQueueCommand({ QueueName: queue }))).QueueUrl!;
  const arn = (
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] }))
  ).Attributes!.QueueArn!;
  await scheduler.send(
    new CreateScheduleCommand({
      Name: schedule,
      ScheduleExpression: "cron(0 9 ? * MON-FRI *)",
      ScheduleExpressionTimezone: ALIAS_TIMEZONE,
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: { Arn: arn, RoleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-role` },
    }),
  );
});

test.afterAll(async () => {
  await events.send(new DeleteEventBusCommand({ Name: bus })).catch(() => {});
  await scheduler.send(new DeleteScheduleCommand({ Name: schedule })).catch(() => {});
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

test("a bus that doesn't exist is reported, not shown as an empty bus", async ({ page }) => {
  await page.goto(`/eventbridge/rules?bus=${missing}`);
  await expect(page.getByText(`Event bus ${missing} not found`)).toBeVisible();
  await expect(page.getByRole("link", { name: "View event buses" })).toBeVisible();
  // Ô chọn bus hiện tên đang xem, không để trống
  await expect(page.getByRole("button", { name: new RegExp(missing) })).toBeVisible();
  // Tạo rule từ đây không mang theo bus không có
  await expect(page.getByRole("link", { name: "Create rule" }).first()).toHaveAttribute(
    "href",
    "/eventbridge/rules/create",
  );
});

test("a schedule group that doesn't exist is reported and can't be deleted", async ({ page }) => {
  await page.goto(`/eventbridge/schedules?group=${missing}`);
  await expect(page.getByText(`Schedule group ${missing} not found`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete group" })).toBeDisabled();
  // Ô chọn group hiện tên đang xem, không để trống
  await expect(page.getByRole("button", { name: new RegExp(missing) })).toBeVisible();
});

test("choosing another bus moves a schedule rule back to an event pattern rule", async ({
  page,
}) => {
  await page.goto("/eventbridge/rules/create");
  await page.getByRole("radio", { name: /Schedule/ }).check();
  await expect(page.getByRole("textbox", { name: /Schedule expression/ })).toBeVisible();

  await page.getByRole("button", { name: /Event bus/ }).click();
  await page.getByRole("option", { name: bus }).click();

  await expect(page.getByRole("radio", { name: /Schedule/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Event pattern/ })).toBeChecked();
  await expect(page.getByRole("textbox", { name: /Schedule expression/ })).toHaveCount(0);
});

test("editing a schedule keeps a time zone the browser list doesn't have", async ({ page }) => {
  await page.goto(`/eventbridge/schedules/default/${schedule}/edit`);
  await expect(page.getByRole("button", { name: /Time zone/ })).toContainText(ALIAS_TIMEZONE);
});

test("a bus a schedule sends to: deleting it warns, then the schedule shows it as not found", async ({
  page,
}) => {
  const targetBus = uniqueName("tbus");
  const targetSchedule = uniqueName("tsched");
  const { region } = await consoleConfig();
  await events.send(new CreateEventBusCommand({ Name: targetBus }));
  await scheduler.send(
    new CreateScheduleCommand({
      Name: targetSchedule,
      ScheduleExpression: "rate(1 hour)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: {
        Arn: `arn:aws:events:${region}:${ACCOUNT_ID}:event-bus/${targetBus}`,
        RoleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-role`,
        Input: "{}",
        EventBridgeParameters: { Source: "lc.e2e", DetailType: "Tick" },
      },
    }),
  );
  try {
    await page.goto(`/eventbridge/schedules/default/${targetSchedule}`);
    await expect(page.getByRole("link", { name: targetBus })).toBeVisible();

    await page.goto("/eventbridge/buses");
    await page
      .getByRole("row", { name: new RegExp(targetBus) })
      .getByRole("checkbox")
      .check();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Delete 1 event bus/ });
    await expect(
      dialog.getByText(new RegExp(`EventBridge rules or schedules still point at\\s+${targetBus}`)),
    ).toBeVisible();
    await dialog.getByRole("textbox").fill("delete");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(flash(page).getByText("Deleted 1 event bus")).toBeVisible();

    await page.goto(`/eventbridge/schedules/default/${targetSchedule}`);
    await expect(page.getByText(`${targetBus} (not found)`)).toBeVisible();
  } finally {
    await scheduler.send(new DeleteScheduleCommand({ Name: targetSchedule })).catch(() => {});
    await events.send(new DeleteEventBusCommand({ Name: targetBus })).catch(() => {});
  }
});
