import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  type CodeSample,
} from "@shared/codeSamples.ts";
import { DEFAULT_BUS_NAME, DEFAULT_EVENT_SOURCE } from "./constants.ts";
import type { Rule } from "./rules.ts";
import type { Schedule } from "./schedules.ts";

const SAMPLE_DETAIL_TYPE = "OrderCreated";

// Gửi một event lên bus của rule; source và detail-type sửa cho khớp event pattern của rule
export function ruleSample(rule: Rule): CodeSample {
  const bus = literal(rule.bus || DEFAULT_BUS_NAME);
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";',
      "",
      "const events = new EventBridgeClient({});",
      "const { Entries } = await events.send(new PutEventsCommand({",
      "  Entries: [{",
      `    EventBusName: ${bus},`,
      `    Source: ${literal(DEFAULT_EVENT_SOURCE)},`,
      `    DetailType: ${literal(SAMPLE_DETAIL_TYPE)},`,
      '    Detail: JSON.stringify({ message: "hello" }),',
      "  }],",
      "}));",
      "console.log(Entries?.[0]?.EventId);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import json",
      "import boto3",
      "",
      'events = boto3.client("events")',
      "response = events.put_events(Entries=[{",
      `    "EventBusName": ${bus},`,
      `    "Source": ${literal(DEFAULT_EVENT_SOURCE)},`,
      `    "DetailType": ${literal(SAMPLE_DETAIL_TYPE)},`,
      '    "Detail": json.dumps({"message": "hello"}),',
      "}])",
      'print(response["Entries"][0]["EventId"])',
    ),
  };
}

// Tạo một schedule giống schedule này từ app
export function scheduleSample(schedule: Schedule): CodeSample {
  const name = literal(schedule.Name ?? "");
  const group = literal(schedule.GroupName ?? "");
  const expression = literal(schedule.ScheduleExpression ?? "");
  const target = literal(schedule.Target?.Arn ?? "");
  const role = literal(schedule.Target?.RoleArn ?? "");
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";',
      "",
      "const scheduler = new SchedulerClient({});",
      "await scheduler.send(new CreateScheduleCommand({",
      `  Name: ${name},`,
      `  GroupName: ${group},`,
      `  ScheduleExpression: ${expression},`,
      '  FlexibleTimeWindow: { Mode: "OFF" },',
      `  Target: { Arn: ${target}, RoleArn: ${role} },`,
      "}));",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'scheduler = boto3.client("scheduler")',
      "scheduler.create_schedule(",
      `    Name=${name},`,
      `    GroupName=${group},`,
      `    ScheduleExpression=${expression},`,
      '    FlexibleTimeWindow={"Mode": "OFF"},',
      `    Target={"Arn": ${target}, "RoleArn": ${role}},`,
      ")",
    ),
  };
}
