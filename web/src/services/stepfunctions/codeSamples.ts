import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  type CodeSample,
} from "@shared/codeSamples.ts";
import type { StateMachine } from "./stateMachines.ts";

// Chạy state machine từ app, rồi hỏi lại trạng thái
export function stateMachineSample(machine: StateMachine): CodeSample {
  const arn = literal(machine.arn);
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from "@aws-sdk/client-sfn";',
      "",
      "const sfn = new SFNClient({});",
      "const { executionArn } = await sfn.send(new StartExecutionCommand({",
      `  stateMachineArn: ${arn},`,
      "  input: JSON.stringify({ orderId: 42 }),",
      "}));",
      "const { status } = await sfn.send(new DescribeExecutionCommand({ executionArn }));",
      "console.log(status);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import json",
      "import boto3",
      "",
      'sfn = boto3.client("stepfunctions")',
      "execution = sfn.start_execution(",
      `    stateMachineArn=${arn},`,
      '    input=json.dumps({"orderId": 42}),',
      ")",
      'status = sfn.describe_execution(executionArn=execution["executionArn"])["status"]',
      "print(status)",
    ),
  };
}
