import {
  CreateClusterCommand,
  DeleteClusterCommand,
  DeregisterTaskDefinitionCommand,
  ECSClient,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { DescribeSubnetsCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, expect, test, uniqueName } from "./fixtures.ts";

// ECS nối với service khác trên UI (spec 3.7, 3.8): target ECS của rule thêm từ form và chạy task thật,
// bước ecs:runTask của Step Functions link sang cluster, stack CloudFormation link sang trang ECS

const cluster = uniqueName("ecs-int");
const family = uniqueName("ecs-int-td");
const rule = uniqueName("ecs-int-rule");
const source = uniqueName("ecs-int-src");
const stateMachine = uniqueName("ecs-int-sm");
const stack = uniqueName("ecs-int-stack");
const stackCluster = uniqueName("ecs-int-stackcl");
const stackFamily = uniqueName("ecs-int-stacktd");
const stackService = uniqueName("ecs-int-stacksvc");
// Thời gian task busybox chạy xong (image có sẵn sau lần đầu)
const TASK_TIMEOUT_MS = 60_000;
const BUSYBOX = "public.ecr.aws/docker/library/busybox:latest";

test.describe.configure({ mode: "serial" });

let config: ReturnType<typeof viaConsole>;
let region = "";
let subnet = "";
let clusterArn = "";
let taskDefinitionArn = "";
let stateMachineArn = "";

const fargate = {
  requiresCompatibilities: ["FARGATE" as const],
  networkMode: "awsvpc" as const,
  cpu: "256",
  memory: "512",
};

test.beforeAll(async () => {
  region = (await consoleConfig()).region;
  config = viaConsole(region);
  const ecs = new ECSClient(config);
  clusterArn =
    (await ecs.send(new CreateClusterCommand({ clusterName: cluster }))).cluster?.clusterArn ?? "";
  taskDefinitionArn =
    (
      await ecs.send(
        new RegisterTaskDefinitionCommand({
          family,
          ...fargate,
          containerDefinitions: [
            { name: "main", image: BUSYBOX, essential: true, command: ["sh", "-c", "echo hi"] },
          ],
        }),
      )
    ).taskDefinition?.taskDefinitionArn ?? "";
  const { Subnets = [] } = await new EC2Client(config).send(new DescribeSubnetsCommand({}));
  subnet = Subnets.find((candidate) => candidate.DefaultForAz)?.SubnetId ?? "";
  await new EventBridgeClient(config).send(
    new PutRuleCommand({ Name: rule, EventPattern: JSON.stringify({ source: [source] }) }),
  );
});

test.afterAll(async () => {
  const events = new EventBridgeClient(config);
  const { Targets = [] } = await events.send(new ListTargetsByRuleCommand({ Rule: rule }));
  if (Targets.length)
    await events.send(
      new RemoveTargetsCommand({ Rule: rule, Ids: Targets.map((target) => target.Id ?? "") }),
    );
  await events.send(new DeleteRuleCommand({ Name: rule })).catch(() => undefined);
  if (stateMachineArn)
    await new SFNClient(config).send(new DeleteStateMachineCommand({ stateMachineArn }));
  await new CloudFormationClient(config)
    .send(new DeleteStackCommand({ StackName: stack }))
    .catch(() => undefined);
  const ecs = new ECSClient(config);
  const { taskDefinitionArns = [] } = await ecs.send(
    new ListTaskDefinitionsCommand({ familyPrefix: family }),
  );
  for (const arn of taskDefinitionArns)
    await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
  await ecs.send(new DeleteClusterCommand({ cluster })).catch(() => undefined);
});

// Mở tab Tasks › Stopped của cluster, làm mới tới khi thấy task do `startedBy` chạy
async function expectStoppedTask(
  page: import("@playwright/test").Page,
  startedBy: string | RegExp,
) {
  await page.goto(`/ecs/clusters/${cluster}?tab=tasks`);
  await page.getByRole("button", { name: "Stopped", exact: true }).click();
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).last().click();
    await expect(page.getByRole("row", { name: startedBy })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: TASK_TIMEOUT_MS });
}

test("adds an ECS task target to a rule, and a matching event runs the task", async ({ page }) => {
  await page.goto(`/eventbridge/rules/default/${rule}`);
  await page.getByRole("button", { name: "Add target" }).click();
  const dialog = page.getByRole("dialog");
  await choose(page, dialog, /^Type/, { name: "ECS task" });
  await choose(page, dialog, /^ECS task/, { name: cluster });
  await choose(page, dialog, /^Task definition/, { name: family });
  // Subnet mặc định chọn sẵn: Floci bắt buộc network config cho Fargate (spec 7 #5)
  await expect(dialog.getByText(/subnet-default-/)).toBeVisible();
  await dialog.getByRole("button", { name: "Add target" }).click();

  const row = page.getByRole("row", { name: /ECS task/ });
  await expect(row.getByRole("link", { name: cluster })).toHaveAttribute(
    "href",
    `/ecs/clusters/${cluster}`,
  );
  await expect(row.getByRole("link", { name: `${family}:1` })).toBeVisible();

  await new EventBridgeClient(config).send(
    new PutEventsCommand({ Entries: [{ Source: source, DetailType: "e2e", Detail: "{}" }] }),
  );
  await expectStoppedTask(page, /eventbridge/);
});

test("a Step Functions step that runs a task links to its cluster", async ({ page }) => {
  const sfn = new SFNClient(config);
  const definition = {
    StartAt: "Run",
    States: {
      Run: {
        Type: "Task",
        Resource: "arn:aws:states:::ecs:runTask.sync",
        End: true,
        Parameters: {
          Cluster: clusterArn,
          TaskDefinition: taskDefinitionArn,
          LaunchType: "FARGATE",
          NetworkConfiguration: { AwsvpcConfiguration: { Subnets: [subnet] } },
        },
      },
    },
  };
  ({ stateMachineArn = "" } = await sfn.send(
    new CreateStateMachineCommand({
      name: stateMachine,
      definition: JSON.stringify(definition),
      roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-sfn`,
    }),
  ));
  const { executionArn = "" } = await sfn.send(new StartExecutionCommand({ stateMachineArn }));
  // .sync chờ task dừng; busybox thoát 0 nên execution thành công
  await waitFor("execution to finish", async () => {
    const { status } = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    return status === "RUNNING" ? undefined : status;
  });

  await page.goto(`/stepfunctions/execution?${new URLSearchParams({ arn: executionArn })}`);
  const link = page.getByRole("link", { name: cluster });
  await expect(link).toHaveAttribute("href", `/ecs/clusters/${cluster}?tab=tasks`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}\\?tab=tasks$`));
});

test("a CloudFormation stack's ECS resources link to their pages", async ({ page }) => {
  const template = {
    Resources: {
      Cluster: { Type: "AWS::ECS::Cluster", Properties: { ClusterName: stackCluster } },
      TaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: stackFamily,
          RequiresCompatibilities: ["FARGATE"],
          NetworkMode: "awsvpc",
          Cpu: "256",
          Memory: "512",
          ContainerDefinitions: [{ Name: "main", Image: BUSYBOX, Essential: true }],
        },
      },
      // Desired 0: không để lại task khi xóa stack (Floci không dừng task của service đã xóa, spec 7 #10)
      Service: {
        Type: "AWS::ECS::Service",
        Properties: {
          ServiceName: stackService,
          Cluster: { Ref: "Cluster" },
          TaskDefinition: { Ref: "TaskDefinition" },
          DesiredCount: 0,
          LaunchType: "FARGATE",
          NetworkConfiguration: { AwsvpcConfiguration: { Subnets: [subnet] } },
        },
      },
    },
  };
  const cloudformation = new CloudFormationClient(config);
  await cloudformation.send(
    new CreateStackCommand({ StackName: stack, TemplateBody: JSON.stringify(template) }),
  );
  await waitFor("stack to be created", async () => {
    const { Stacks = [] } = await cloudformation.send(
      new DescribeStacksCommand({ StackName: stack }),
    );
    return Stacks[0]?.StackStatus === "CREATE_COMPLETE" ? true : undefined;
  });

  // Trang ECS → stack
  await page.goto(`/ecs/clusters/${stackCluster}`);
  await expect(page.getByRole("link", { name: stack })).toBeVisible();
  await page.goto(`/ecs/clusters/${stackCluster}/services/${stackService}`);
  await expect(page.getByRole("link", { name: stack })).toBeVisible();
  await page.goto(`/ecs/task-definitions/${stackFamily}/1`);
  await expect(page.getByRole("link", { name: stack })).toBeVisible();

  // Stack → trang ECS
  await page.goto(`/cloudformation/stacks/${stack}?tab=resources`);
  // exact: tên cluster cũng nằm trong ARN của service
  await expect(page.getByRole("link", { name: stackCluster, exact: true })).toHaveAttribute(
    "href",
    `/ecs/clusters/${stackCluster}`,
  );
  await expect(
    page.getByRole("link", { name: new RegExp(`service/${stackCluster}/${stackService}`) }),
  ).toHaveAttribute("href", `/ecs/clusters/${stackCluster}/services/${stackService}`);
  await expect(
    page.getByRole("link", { name: new RegExp(`task-definition/${stackFamily}:1`) }),
  ).toHaveAttribute("href", `/ecs/task-definitions/${stackFamily}/1`);
});
