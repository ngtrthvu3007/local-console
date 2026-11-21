import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  GetScheduleCommand,
  ListScheduleGroupsCommand,
  ListSchedulesCommand,
  SchedulerClient,
  UpdateScheduleCommand,
  type GetScheduleCommandOutput,
} from "@aws-sdk/client-scheduler";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Đúng các luồng của trang Schedules: group, rate đẩy vào queue, bật / tắt bằng GetSchedule +
// UpdateSchedule (giữ trường form không có), at() tự xóa, xóa group kéo theo schedule

const group = uniqueName("group");
const rateName = uniqueName("rate");
const atName = uniqueName("at");
const queueName = uniqueName("sched-queue");
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/lc-it-role`;
const PAYLOAD = "lc-it-ping";

let scheduler: SchedulerClient;
let sqs: SQSClient;
let queueUrl: string;
let queueArn: string;

// Giống toUpdateInput của console: request = GetSchedule + phần thay đổi
const toUpdate = (current: GetScheduleCommandOutput, changes: object) => ({
  Name: current.Name,
  GroupName: current.GroupName,
  ScheduleExpression: current.ScheduleExpression,
  ScheduleExpressionTimezone: current.ScheduleExpressionTimezone,
  Description: current.Description,
  State: current.State,
  Target: current.Target,
  FlexibleTimeWindow: current.FlexibleTimeWindow,
  ActionAfterCompletion: current.ActionAfterCompletion,
  ...changes,
});

beforeAll(async () => {
  const { region } = await consoleConfig();
  scheduler = new SchedulerClient(viaConsole(region));
  sqs = new SQSClient(viaConsole(region));
  queueUrl = (await sqs.send(new CreateQueueCommand({ QueueName: queueName }))).QueueUrl!;
  queueArn = (
    await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["QueueArn"] }),
    )
  ).Attributes!.QueueArn!;
  await scheduler.send(new CreateScheduleGroupCommand({ Name: group }));
});

afterAll(async () => {
  await scheduler.send(new DeleteScheduleGroupCommand({ Name: group })).catch(() => {});
  await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
});

const groupNames = async () =>
  ((await scheduler.send(new ListScheduleGroupsCommand({}))).ScheduleGroups ?? []).map(
    (g) => g.Name,
  );

describe("schedule group", () => {
  it("lists the default group and the new one", async () => {
    expect(await groupNames()).toEqual(expect.arrayContaining(["default", group]));
  });

  it("can't delete the default group", async () => {
    await expect(
      scheduler.send(new DeleteScheduleGroupCommand({ Name: "default" })),
    ).rejects.toThrow(/default/i);
  });
});

describe("rate schedule to a queue", () => {
  beforeAll(async () => {
    await scheduler.send(
      new CreateScheduleCommand({
        Name: rateName,
        GroupName: group,
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Description: "first",
        Target: {
          Arn: queueArn,
          RoleArn: ROLE_ARN,
          Input: PAYLOAD,
          RetryPolicy: { MaximumRetryAttempts: 3 },
        },
      }),
    );
  });

  it("runs on its own and delivers the input to the queue", async () => {
    const body = await waitFor("schedule message in the queue", async () => {
      const received = await sqs.send(
        new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
      );
      return received.Messages?.[0]?.Body;
    });
    expect(body).toBe(PAYLOAD);
  });

  it("lists the schedule with its target ARN but no expression", async () => {
    const [row] =
      (await scheduler.send(new ListSchedulesCommand({ GroupName: group }))).Schedules ?? [];
    expect(row?.Name).toBe(rateName);
    expect(row?.Target?.Arn).toBe(queueArn);
    expect(row).not.toHaveProperty("ScheduleExpression");
  });

  it("disables and enables it through GetSchedule + UpdateSchedule, keeping the role and retry policy", async () => {
    const current = await scheduler.send(
      new GetScheduleCommand({ Name: rateName, GroupName: group }),
    );
    await scheduler.send(new UpdateScheduleCommand(toUpdate(current, { State: "DISABLED" })));

    const disabled = await scheduler.send(
      new GetScheduleCommand({ Name: rateName, GroupName: group }),
    );
    expect(disabled.State).toBe("DISABLED");
    expect(disabled.Target?.RoleArn).toBe(ROLE_ARN);
    expect(disabled.Target?.RetryPolicy?.MaximumRetryAttempts).toBe(3);
    expect(disabled.Description).toBe("first");

    await scheduler.send(new UpdateScheduleCommand(toUpdate(disabled, { State: "ENABLED" })));
    expect(
      (await scheduler.send(new GetScheduleCommand({ Name: rateName, GroupName: group }))).State,
    ).toBe("ENABLED");
  });

  it("rejects a duplicate name and a bad rate", async () => {
    const duplicate = new CreateScheduleCommand({
      Name: rateName,
      GroupName: group,
      ScheduleExpression: "rate(1 hour)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: { Arn: queueArn, RoleArn: ROLE_ARN },
    });
    await expect(scheduler.send(duplicate)).rejects.toMatchObject({ name: "ConflictException" });
    await expect(
      scheduler.send(
        new CreateScheduleCommand({
          Name: atName,
          GroupName: group,
          ScheduleExpression: "rate(0 minutes)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: { Arn: queueArn, RoleArn: ROLE_ARN },
        }),
      ),
    ).rejects.toMatchObject({ name: "ValidationException" });
  });
});

describe("one-time schedule", () => {
  it("keeps the time zone and the delete-after-completion setting", async () => {
    await scheduler.send(
      new CreateScheduleCommand({
        Name: atName,
        GroupName: group,
        ScheduleExpression: "at(2030-01-31T09:00:00)",
        ScheduleExpressionTimezone: "Asia/Ho_Chi_Minh",
        ActionAfterCompletion: "DELETE",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: queueArn, RoleArn: ROLE_ARN },
      }),
    );
    const schedule = await scheduler.send(
      new GetScheduleCommand({ Name: atName, GroupName: group }),
    );
    expect(schedule.ScheduleExpression).toBe("at(2030-01-31T09:00:00)");
    expect(schedule.ScheduleExpressionTimezone).toBe("Asia/Ho_Chi_Minh");
    expect(schedule.ActionAfterCompletion).toBe("DELETE");
  });
});

describe("delete", () => {
  it("deletes one schedule", async () => {
    await scheduler.send(new DeleteScheduleCommand({ Name: atName, GroupName: group }));
    const names = (
      (await scheduler.send(new ListSchedulesCommand({ GroupName: group }))).Schedules ?? []
    ).map((schedule) => schedule.Name);
    expect(names).toEqual([rateName]);
  });

  it("deleting a group deletes the schedules in it", async () => {
    await scheduler.send(new DeleteScheduleGroupCommand({ Name: group }));
    expect(await groupNames()).not.toContain(group);
    expect(
      (await scheduler.send(new ListSchedulesCommand({ GroupName: group }))).Schedules ?? [],
    ).toEqual([]);
  });
});
