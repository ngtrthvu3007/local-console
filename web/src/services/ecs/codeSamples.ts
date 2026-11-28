import { lines } from "@localconsole/core/shared";
import { literal, NODE_AWS_NOTE, PYTHON_AWS_NOTE, type CodeSample } from "@shared/codeSamples.ts";
import { LAUNCH_TYPE } from "@localconsole/core/ecs";

// Chạy một task trên cluster từ app rồi đọc trạng thái; "my-task" là family task definition của app
export function clusterSample(cluster: string, subnet: string): CodeSample {
  const clusterName = literal(cluster);
  const subnetId = literal(subnet);
  const launchType = literal(LAUNCH_TYPE);
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { ECSClient, RunTaskCommand, DescribeTasksCommand } from "@aws-sdk/client-ecs";',
      "",
      "const ecs = new ECSClient({});",
      "const { tasks } = await ecs.send(new RunTaskCommand({",
      `  cluster: ${clusterName},`,
      '  taskDefinition: "my-task",',
      `  launchType: ${launchType},`,
      `  networkConfiguration: { awsvpcConfiguration: { subnets: [${subnetId}] } },`,
      "}));",
      "const { tasks: [task] } = await ecs.send(new DescribeTasksCommand({",
      `  cluster: ${clusterName},`,
      "  tasks: [tasks[0].taskArn],",
      "}));",
      "console.log(task.lastStatus);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'ecs = boto3.client("ecs")',
      "task = ecs.run_task(",
      `    cluster=${clusterName},`,
      '    taskDefinition="my-task",',
      `    launchType=${launchType},`,
      `    networkConfiguration={"awsvpcConfiguration": {"subnets": [${subnetId}]}},`,
      ')["tasks"][0]',
      `described = ecs.describe_tasks(cluster=${clusterName}, tasks=[task["taskArn"]])`,
      'print(described["tasks"][0]["lastStatus"])',
    ),
  };
}
