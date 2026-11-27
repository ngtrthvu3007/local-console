import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, flash, setEditor, test, uniqueName } from "./fixtures.ts";

// Form Schedule với đích là state machine, trên UI: tạo schedule → state machine chạy với input của
// schedule → queue nhận → trang schedule link sang state machine → form sửa nhớ đúng đích.

const machine = uniqueName("sched-machine");
const queue = uniqueName("sched-queue");
const group = uniqueName("sched-group");
const schedule = uniqueName("sched");
const MARKER = "lc-e2e-from-schedule";

test.describe.configure({ mode: "serial" });

let sfn: SFNClient;
let sqs: SQSClient;
let scheduler: SchedulerClient;
let region: string;

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  const config = viaConsole(region);
  sfn = new SFNClient(config);
  sqs = new SQSClient(config);
  scheduler = new SchedulerClient(config);
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queue }));
  await sfn.send(
    new CreateStateMachineCommand({
      name: machine,
      roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-sfn`,
      definition: JSON.stringify({
        StartAt: "Tell",
        States: {
          Tell: {
            Type: "Task",
            Resource: "arn:aws:states:::sqs:sendMessage",
            Parameters: { QueueUrl, "MessageBody.$": "$.from" },
            End: true,
          },
        },
      }),
    }),
  );
});

test.afterAll(async () => {
  await scheduler
    .send(new DeleteScheduleCommand({ Name: schedule, GroupName: group }))
    .catch(() => {});
  await scheduler.send(new DeleteScheduleGroupCommand({ Name: group })).catch(() => {});
  await sfn
    .send(
      new DeleteStateMachineCommand({
        stateMachineArn: `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${machine}`,
      }),
    )
    .catch(() => {});
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl }));
});

test("a schedule can target a state machine, and the state machine runs with the schedule's input", async ({
  page,
}) => {
  await scheduler.send(new CreateScheduleGroupCommand({ Name: group }));
  await page.goto(`/eventbridge/schedules/create?group=${group}`);
  await page.getByPlaceholder("daily-report").fill(schedule);
  await page.getByRole("textbox", { name: "Rate" }).fill("1");
  await page.getByRole("button", { name: /Unit/ }).click();
  await page.getByRole("option", { name: "hours" }).click();

  // Loại Step Functions có trong danh sách đích, danh sách resource là các state machine
  await page.getByRole("button", { name: /Target type/ }).click();
  await page.getByRole("option", { name: "Step Functions", exact: true }).click();
  await page.getByRole("button", { name: /Choose a resource/ }).click();
  await page.getByRole("option", { name: machine }).click();

  // Input của state machine phải là JSON: chữ thường bị chặn trước khi gửi
  await setEditor(page, "not json");
  await page.getByRole("button", { name: "Create schedule" }).last().click();
  await expect(page.getByText(/Invalid JSON/)).toBeVisible();
  await setEditor(page, JSON.stringify({ from: MARKER }));

  await page.getByRole("button", { name: "Create schedule" }).last().click();
  await expect(flash(page).getByText(`Created schedule ${schedule}`)).toBeVisible();

  // Schedule chạy ngay: queue nhận đúng input qua state machine
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
  const body = await waitFor("message from the scheduled execution", async () => {
    const received = await sqs.send(new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 1 }));
    return received.Messages?.[0]?.Body;
  });
  expect(body).toBe(MARKER);
});

test("the schedule page links to the state machine, whose executions show the run", async ({
  page,
}) => {
  await page.goto(`/eventbridge/schedules/${group}/${schedule}`);
  await expect(page.getByText("Step Functions").first()).toBeVisible();
  await page.getByRole("link", { name: machine }).click();
  await expect(page.getByRole("heading", { level: 1, name: machine })).toBeVisible();
  await expect(page.getByText("Succeeded", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("editing keeps the state machine as the target", async ({ page }) => {
  await page.goto(`/eventbridge/schedules/${group}/${schedule}/edit`);
  // Ô loại đích và ô resource nhớ đúng giá trị đang lưu
  await expect(page.getByRole("button", { name: /Target type/ })).toContainText("Step Functions");
  await expect(page.getByRole("button", { name: /Step Functions/ }).last()).toContainText(machine);

  await page.getByRole("button", { name: "Save" }).click();
  await expect(flash(page).getByText(`Saved schedule ${schedule}`)).toBeVisible();
  await expect(page.getByRole("link", { name: machine })).toBeVisible();
});
