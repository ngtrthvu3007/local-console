import {
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, flash, setEditor, test, uniqueName } from "./fixtures.ts";

// Luồng chính của trang Schedules trên UI: tạo group → tạo schedule rate đẩy vào queue → queue nhận
// → tắt → sửa lịch → xóa schedule → xóa group. Resource dọn bằng SDK ở afterAll để test lỗi giữa chừng
// vẫn sạch.

const schedule = uniqueName("sched");
const group = uniqueName("group");
const queue = uniqueName("queue");
const PAYLOAD = "lc-e2e-ping";

test.describe.configure({ mode: "serial" });

let sqs: SQSClient;
let scheduler: SchedulerClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  sqs = new SQSClient(viaConsole(region));
  scheduler = new SchedulerClient(viaConsole(region));
  await sqs.send(new CreateQueueCommand({ QueueName: queue }));
});

test.afterAll(async () => {
  await scheduler
    .send(new DeleteScheduleCommand({ Name: schedule, GroupName: group }))
    .catch(() => {});
  await scheduler.send(new DeleteScheduleGroupCommand({ Name: group })).catch(() => {});
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

test("create a schedule group; the default group can't be deleted", async ({ page }) => {
  await page.goto("/eventbridge/schedules");
  await expect(page.getByRole("button", { name: "Delete group" })).toBeDisabled();

  await page.getByRole("button", { name: "Create group" }).click();
  const dialog = page.getByRole("dialog", { name: "Create schedule group" });
  await dialog.getByPlaceholder("jobs").fill("not valid");
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(dialog.getByText(/Use only letters/)).toBeVisible();

  await dialog.getByPlaceholder("jobs").fill(group);
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(flash(page).getByText(`Created schedule group ${group}`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`group=${group}`));
  await expect(page.getByRole("button", { name: "Delete group" })).toBeEnabled();
});

test("create a rate schedule to the queue and the queue receives its input", async ({ page }) => {
  await page.goto(`/eventbridge/schedules/create?group=${group}`);
  await page.getByPlaceholder("daily-report").fill(schedule);

  // Rate không hợp lệ bị chặn trước khi gửi
  await page.getByRole("textbox", { name: "Rate" }).fill("0");
  await page.getByRole("button", { name: "Create schedule" }).last().click();
  await expect(page.getByText("Enter a whole number, 1 or more.")).toBeVisible();
  await page.getByRole("textbox", { name: "Rate" }).fill("1");
  await page.getByRole("button", { name: /Unit/ }).click();
  await page.getByRole("option", { name: "hours" }).click();

  await page.getByRole("button", { name: /Target type/ }).click();
  await page.getByRole("option", { name: "SQS", exact: true }).click();
  await page.getByRole("button", { name: /^SQS/ }).last().click();
  await page.getByRole("option", { name: queue }).click();
  await setEditor(page, PAYLOAD);

  await page.getByRole("button", { name: "Create schedule" }).last().click();
  await expect(flash(page).getByText(`Created schedule ${schedule}`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/schedules/${group}/${schedule}$`));
  await expect(page.getByText("rate(1 hour)").first()).toBeVisible();
  await expect(page.getByRole("link", { name: queue })).toBeVisible();

  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  const body = await waitFor("schedule message in the queue", async () => {
    const received = await sqs.send(new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 1 }));
    return received.Messages?.[0]?.Body;
  });
  expect(body).toBe(PAYLOAD);
});

test("disable, edit the rate, then delete the schedule and the group", async ({ page }) => {
  await page.goto(`/eventbridge/schedules/${group}/${schedule}`);
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(flash(page).getByText("Disabled schedule")).toBeVisible();
  await expect(page.getByText(/Recurring · rate\(1 hour\) · Disabled/)).toBeVisible();

  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rate" })).toHaveValue("1");
  await page.getByRole("textbox", { name: "Rate" }).fill("2");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(`Saved schedule ${schedule}`)).toBeVisible();
  await expect(page.getByText("rate(2 hours)").first()).toBeVisible();
  // Sửa không bật lại schedule đã tắt ở bước trước? Ô Enabled lấy từ State hiện có
  await expect(page.getByText(/Disabled/).first()).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Delete 1 schedule/ });
  await dialog.getByPlaceholder("delete").fill("delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(flash(page).getByText("Deleted 1 schedule")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/schedules\\?group=${group}$`));

  await page.getByRole("button", { name: "Delete group" }).click();
  const del = page.getByRole("dialog", { name: /Delete schedule group/ });
  await del.getByPlaceholder("delete").fill("delete");
  await del.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(flash(page).getByText(`Deleted schedule group ${group}`)).toBeVisible();
});
