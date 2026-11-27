import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateClusterCommand,
  CreateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
  DeleteTaskDefinitionsCommand,
  DeregisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
  DeleteClusterCommand,
  DescribeClustersCommand,
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  type Task,
  ListClustersCommand,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { DescribeSubnetsCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  DeleteRuleCommand,
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  GetExecutionHistoryCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { ACCOUNT_ID, consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Hành vi ECS của Floci mà trang ECS dựa vào, qua proxy /aws của console (spec ECS mục 7)

const BUSYBOX = "public.ecr.aws/docker/library/busybox:latest";
const MISSING_REVISION = 99;

let ecs: ECSClient;
let ssm: SSMClient;
let region = "";
const cluster = uniqueName("ecs");
const missingCluster = uniqueName("ecs-missing");

const clusterArns = async () => (await ecs.send(new ListClustersCommand({}))).clusterArns ?? [];
const hasCluster = async (name: string) =>
  (await clusterArns()).some((arn) => arn.endsWith(`/${name}`));

// Task definition Fargate nhỏ nhất Floci chạy được
const fargateTaskDefinition = (family: string, container: Record<string, unknown> = {}) => ({
  family,
  requiresCompatibilities: ["FARGATE" as const],
  networkMode: "awsvpc" as const,
  cpu: "256",
  memory: "512",
  containerDefinitions: [{ name: "main", image: BUSYBOX, essential: true, ...container }],
});

beforeAll(async () => {
  region = (await consoleConfig()).region;
  ecs = new ECSClient(viaConsole(region));
  ssm = new SSMClient(viaConsole(region));
  await ecs.send(new CreateClusterCommand({ clusterName: cluster }));
});

afterAll(async () => {
  await ecs.send(new DeleteClusterCommand({ cluster })).catch(() => undefined);
});

describe("clusters", () => {
  it("lists a new cluster", async () => {
    expect(await hasCluster(cluster)).toBe(true);
  });

  // Trang chi tiết dò bằng DescribeClusters: không có thì 200 + failures, không ghi console.error
  it("reports a missing cluster as a failure, not an error", async () => {
    const { clusters, failures } = await ecs.send(
      new DescribeClustersCommand({ clusters: [missingCluster] }),
    );
    expect(clusters).toEqual([]);
    expect(failures?.[0]?.reason).toBe("MISSING");
  });

  // Vì vậy trang không gọi ListTasks trước khi biết cluster có thật (spec 7 #13)
  it("rejects ListTasks on a missing cluster", async () => {
    await expect(ecs.send(new ListTasksCommand({ cluster: missingCluster }))).rejects.toMatchObject(
      {
        name: "ClusterNotFoundException",
      },
    );
  });

  it("deletes a cluster", async () => {
    const extra = uniqueName("ecs-del");
    await ecs.send(new CreateClusterCommand({ clusterName: extra }));
    await ecs.send(new DeleteClusterCommand({ cluster: extra }));
    expect(await hasCluster(extra)).toBe(false);
  });
});

describe("task definitions", () => {
  const family = uniqueName("ecs-td");
  const revisionArns = (status: "ACTIVE" | "INACTIVE" | "DELETE_IN_PROGRESS") =>
    ecs
      .send(new ListTaskDefinitionsCommand({ familyPrefix: family, status }))
      .then((result) => result.taskDefinitionArns ?? []);

  afterAll(async () => {
    for (const arn of await revisionArns("ACTIVE"))
      await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
    const inactive = await revisionArns("INACTIVE");
    if (inactive.length)
      await ecs.send(new DeleteTaskDefinitionsCommand({ taskDefinitions: inactive }));
  });

  // Trang revision lấy status bằng ListTaskDefinitions theo từng status, không Describe từng revision
  it("lists revisions by status: active, inactive, delete in progress", async () => {
    await ecs.send(new RegisterTaskDefinitionCommand(fargateTaskDefinition(family)));
    const second = await ecs.send(new RegisterTaskDefinitionCommand(fargateTaskDefinition(family)));
    expect(second.taskDefinition?.revision).toBe(2);

    const [first] = (await revisionArns("ACTIVE")).filter((arn) => arn.endsWith(":1"));
    await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: first }));
    expect(await revisionArns("INACTIVE")).toEqual([first]);

    // Floci giữ revision đã xóa ở DELETE_IN_PROGRESS (spec 7 #9)
    await ecs.send(new DeleteTaskDefinitionsCommand({ taskDefinitions: [first] }));
    expect(await revisionArns("DELETE_IN_PROGRESS")).toEqual([first]);
  });

  // Vì vậy trang chi tiết kiểm revision có trong danh sách trước khi Describe (spec 7 #13)
  it("rejects describing a missing revision", async () => {
    await expect(
      ecs.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: `${family}:${MISSING_REVISION}` }),
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 400 } });
  });

  // Container định nghĩa secrets.valueFrom bằng ARN parameter: trang SSM mở được bằng ARN không
  it("reads a parameter by its ARN", async () => {
    const name = `/${uniqueName("ecs-param")}`;
    await ssm.send(new PutParameterCommand({ Name: name, Value: "v", Type: "String" }));
    try {
      const arn = `arn:aws:ssm:${region}:${ACCOUNT_ID}:parameter${name}`;
      const { Parameter } = await ssm.send(new GetParameterCommand({ Name: arn }));
      expect(Parameter?.Name).toBe(name);
    } finally {
      await ssm.send(new DeleteParameterCommand({ Name: name }));
    }
  });
});

describe("tasks", () => {
  const family = uniqueName("ecs-task");
  const badFamily = uniqueName("ecs-badsec");
  const secretName = uniqueName("ecs-secret");
  const parameterName = `/${uniqueName("ecs-par")}`;
  const logGroup = `/${uniqueName("ecs-logs")}`;
  const SECRET_VALUE = "s3cr3t-it";
  const PARAMETER_VALUE = "param-it";
  const EXIT_CODE = 3;
  const STREAM_PREFIX = "it";
  let logs: CloudWatchLogsClient;
  let secrets: SecretsManagerClient;
  let secretArn = "";
  let subnet = "";

  const run = async (taskDefinition: string, overrides = {}) => {
    const { tasks, failures } = await ecs.send(
      new RunTaskCommand({
        cluster,
        taskDefinition,
        launchType: "FARGATE",
        networkConfiguration: { awsvpcConfiguration: { subnets: [subnet] } },
        overrides,
      }),
    );
    expect(failures).toEqual([]);
    return tasks?.[0]?.taskArn ?? "";
  };
  const describe1 = async (arn: string) =>
    (await ecs.send(new DescribeTasksCommand({ cluster, tasks: [arn] }))).tasks?.[0];
  const waitForStatus = (arn: string, status: string) =>
    waitFor<Task>(`task ${status}`, async () => {
      const task = await describe1(arn);
      return task?.lastStatus === status ? task : undefined;
    });

  beforeAll(async () => {
    const config = viaConsole(region);
    logs = new CloudWatchLogsClient(config);
    secrets = new SecretsManagerClient(config);
    const ec2 = new EC2Client(config);
    const { Subnets = [] } = await ec2.send(new DescribeSubnetsCommand({}));
    subnet = Subnets.find((candidate) => candidate.DefaultForAz)?.SubnetId ?? "";

    secretArn =
      (
        await secrets.send(
          new CreateSecretCommand({ Name: secretName, SecretString: SECRET_VALUE }),
        )
      ).ARN ?? "";
    await ssm.send(
      new PutParameterCommand({
        Name: parameterName,
        Value: PARAMETER_VALUE,
        Type: "SecureString",
      }),
    );
    await ecs.send(
      new RegisterTaskDefinitionCommand(
        fargateTaskDefinition(family, {
          command: ["sh", "-c", `echo SEC=$SEC PAR=$PAR EXTRA=$EXTRA; exit ${EXIT_CODE}`],
          secrets: [
            { name: "SEC", valueFrom: secretArn },
            { name: "PAR", valueFrom: parameterName },
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroup,
              "awslogs-region": region,
              "awslogs-stream-prefix": STREAM_PREFIX,
            },
          },
        }),
      ),
    );
    await ecs.send(
      new RegisterTaskDefinitionCommand(
        fargateTaskDefinition(badFamily, {
          secrets: [{ name: "SEC", valueFrom: `${secretArn.slice(0, -6)}nosuch` }],
        }),
      ),
    );
  });

  afterAll(async () => {
    for (const name of [family, badFamily]) {
      const { taskDefinitionArns = [] } = await ecs.send(
        new ListTaskDefinitionsCommand({ familyPrefix: name }),
      );
      for (const arn of taskDefinitionArns)
        await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
    }
    await secrets.send(
      new DeleteSecretCommand({ SecretId: secretName, ForceDeleteWithoutRecovery: true }),
    );
    await ssm.send(new DeleteParameterCommand({ Name: parameterName }));
    await logs.send(new DeleteLogGroupCommand({ logGroupName: logGroup })).catch(() => undefined);
  });

  // Tab Logs đọc stream "<prefix>/<container>/<task ID>" (spec 3.4)
  it("runs a task with overrides, records its exit code and logs", async () => {
    const arn = await run(family, {
      containerOverrides: [{ name: "main", environment: [{ name: "EXTRA", value: "x1" }] }],
    });
    const task = await waitForStatus(arn, "STOPPED");
    expect(task.stopCode).toBe("EssentialContainerExited");
    expect(task.containers?.[0]?.exitCode).toBe(EXIT_CODE);

    const taskId = arn.split("/").pop();
    const lines = await waitFor("task logs", async () => {
      const { events = [] } = await logs.send(
        new GetLogEventsCommand({
          logGroupName: logGroup,
          logStreamName: `${STREAM_PREFIX}/main/${taskId}`,
          startFromHead: true,
        }),
      );
      return events.length ? events.map((event) => event.message) : undefined;
    });
    expect(lines).toContain(`SEC=${SECRET_VALUE} PAR=${PARAMETER_VALUE} EXTRA=x1`);
  });

  it("stops a running task with the console's reason", async () => {
    const arn = await run(family, {
      containerOverrides: [{ name: "main", command: ["sh", "-c", "sleep 300"] }],
    });
    await waitForStatus(arn, "RUNNING");
    await ecs.send(
      new StopTaskCommand({ cluster, task: arn, reason: "Stopped from Local Console" }),
    );
    const task = await waitForStatus(arn, "STOPPED");
    expect(task.stopCode).toBe("UserInitiated");
    expect(task.stoppedReason).toBe("Stopped from Local Console");
  });

  // Lỗi hay gặp hiện ở stoppedReason của task (spec 5)
  it("fails to start when a secret is missing", async () => {
    const task = await waitForStatus(await run(badFamily), "STOPPED");
    expect(task.stopCode).toBe("TaskFailedToStart");
    expect(task.stoppedReason).toContain("can't find the specified secret");
  });

  // Task mất sau khi Floci restart: Describe trả failures, trang task hiện "not found" (spec 7 #12)
  it("reports a missing task as a failure", async () => {
    const { failures } = await ecs.send(new DescribeTasksCommand({ cluster, tasks: ["0000"] }));
    expect(failures?.[0]?.reason).toBe("MISSING");
  });
});

describe("services", () => {
  const family = uniqueName("ecs-web");
  const serviceName = uniqueName("ecs-svc");
  let subnet = "";

  const service = async () =>
    (await ecs.send(new DescribeServicesCommand({ cluster, services: [serviceName] })))
      .services?.[0];
  const waitForRunning = (count: number) =>
    waitFor(`${count} running tasks`, async () =>
      (await service())?.runningCount === count ? true : undefined,
    );

  beforeAll(async () => {
    const { Subnets = [] } = await new EC2Client(viaConsole(region)).send(
      new DescribeSubnetsCommand({}),
    );
    subnet = Subnets.find((candidate) => candidate.DefaultForAz)?.SubnetId ?? "";
    await ecs.send(
      new RegisterTaskDefinitionCommand(
        fargateTaskDefinition(family, { image: "public.ecr.aws/nginx/nginx:alpine" }),
      ),
    );
  });

  afterAll(async () => {
    await ecs
      .send(new DeleteServiceCommand({ cluster, service: serviceName, force: true }))
      .catch(() => undefined);
    const { taskDefinitionArns = [] } = await ecs.send(
      new ListTaskDefinitionsCommand({ familyPrefix: family }),
    );
    for (const arn of taskDefinitionArns)
      await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
  });

  it("keeps the desired number of tasks, scales to zero, deletes with force", async () => {
    await ecs.send(
      new CreateServiceCommand({
        cluster,
        serviceName,
        taskDefinition: family,
        desiredCount: 1,
        launchType: "FARGATE",
        networkConfiguration: { awsvpcConfiguration: { subnets: [subnet] } },
      }),
    );
    await waitForRunning(1);
    const { taskArns = [] } = await ecs.send(new ListTasksCommand({ cluster, serviceName }));
    expect(taskArns).toHaveLength(1);
    const [task] =
      (await ecs.send(new DescribeTasksCommand({ cluster, tasks: taskArns }))).tasks ?? [];
    expect(task?.startedBy).toMatch(/^ecs-svc\//);

    await ecs.send(new UpdateServiceCommand({ cluster, service: serviceName, desiredCount: 0 }));
    await waitForRunning(0);

    await ecs.send(new DeleteServiceCommand({ cluster, service: serviceName, force: true }));
    const after = await ecs.send(new DescribeServicesCommand({ cluster, services: [serviceName] }));
    const status = after.services?.[0]?.status ?? after.failures?.[0]?.reason;
    expect(["INACTIVE", "DRAINING", "MISSING"]).toContain(status);
  });
});

// Target ECS mà form EventBridge tạo (spec 3.7): EcsParameters đúng dạng thì Floci chạy task thật
describe("EventBridge target", () => {
  const family = uniqueName("ecs-evt");
  const rule = uniqueName("ecs-rule");
  const source = uniqueName("ecs-src");
  const TARGET_ID = "ecs-target";
  let events: EventBridgeClient;

  beforeAll(async () => {
    events = new EventBridgeClient(viaConsole(region));
    const { Subnets = [] } = await new EC2Client(viaConsole(region)).send(
      new DescribeSubnetsCommand({}),
    );
    const subnet = Subnets.find((candidate) => candidate.DefaultForAz)?.SubnetId ?? "";
    const { taskDefinition } = await ecs.send(
      new RegisterTaskDefinitionCommand(
        fargateTaskDefinition(family, { command: ["sh", "-c", "echo from rule"] }),
      ),
    );
    const { clusters = [] } = await ecs.send(new DescribeClustersCommand({ clusters: [cluster] }));
    await events.send(
      new PutRuleCommand({ Name: rule, EventPattern: JSON.stringify({ source: [source] }) }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: rule,
        Targets: [
          {
            Id: TARGET_ID,
            Arn: clusters[0]?.clusterArn,
            RoleArn: `arn:aws:iam::${ACCOUNT_ID}:role/lambda-role`,
            EcsParameters: {
              TaskDefinitionArn: taskDefinition?.taskDefinitionArn,
              LaunchType: "FARGATE",
              TaskCount: 1,
              NetworkConfiguration: { awsvpcConfiguration: { Subnets: [subnet] } },
            },
          },
        ],
      }),
    );
  });

  afterAll(async () => {
    await events.send(new RemoveTargetsCommand({ Rule: rule, Ids: [TARGET_ID] }));
    await events.send(new DeleteRuleCommand({ Name: rule }));
    const { taskDefinitionArns = [] } = await ecs.send(
      new ListTaskDefinitionsCommand({ familyPrefix: family }),
    );
    for (const arn of taskDefinitionArns)
      await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
  });

  it("runs a task when a matching event arrives", async () => {
    await events.send(
      new PutEventsCommand({ Entries: [{ Source: source, DetailType: "test", Detail: "{}" }] }),
    );
    const task = await waitFor("task started by the rule", async () => {
      const arns: string[] = [];
      for (const desiredStatus of ["RUNNING", "STOPPED"] as const) {
        const { taskArns = [] } = await ecs.send(
          new ListTasksCommand({ cluster, family, desiredStatus }),
        );
        arns.push(...taskArns);
      }
      if (!arns.length) return undefined;
      const { tasks = [] } = await ecs.send(new DescribeTasksCommand({ cluster, tasks: arns }));
      return tasks.find((candidate) => candidate.startedBy === "eventbridge");
    });
    expect(task.taskDefinitionArn).toContain(family);
  });
});

// Schedule target ECS mà form Scheduler tạo (spec 3.7) và bước ecs:runTask của Step Functions (spec 3.8)
describe("Scheduler and Step Functions", () => {
  const family = uniqueName("ecs-sched");
  const schedule = uniqueName("ecs-sched");
  const machine = uniqueName("ecs-sm");
  const ROLE = `arn:aws:iam::${ACCOUNT_ID}:role/lambda-role`;
  let clusterArn = "";
  let taskDefinitionArn = "";
  let subnet = "";
  let scheduler: SchedulerClient;
  let sfn: SFNClient;
  let stateMachineArn = "";

  const tasksStartedBy = async (startedBy: string) => {
    const arns: string[] = [];
    for (const desiredStatus of ["RUNNING", "STOPPED"] as const) {
      const { taskArns = [] } = await ecs.send(
        new ListTasksCommand({ cluster, family, desiredStatus }),
      );
      arns.push(...taskArns);
    }
    if (!arns.length) return undefined;
    const { tasks = [] } = await ecs.send(new DescribeTasksCommand({ cluster, tasks: arns }));
    return tasks.find((task) => task.startedBy === startedBy);
  };

  beforeAll(async () => {
    scheduler = new SchedulerClient(viaConsole(region));
    sfn = new SFNClient(viaConsole(region));
    const { Subnets = [] } = await new EC2Client(viaConsole(region)).send(
      new DescribeSubnetsCommand({}),
    );
    subnet = Subnets.find((candidate) => candidate.DefaultForAz)?.SubnetId ?? "";
    taskDefinitionArn =
      (
        await ecs.send(
          new RegisterTaskDefinitionCommand(
            fargateTaskDefinition(family, { command: ["sh", "-c", "echo scheduled"] }),
          ),
        )
      ).taskDefinition?.taskDefinitionArn ?? "";
    const { clusters = [] } = await ecs.send(new DescribeClustersCommand({ clusters: [cluster] }));
    clusterArn = clusters[0]?.clusterArn ?? "";
  });

  afterAll(async () => {
    await scheduler.send(new DeleteScheduleCommand({ Name: schedule })).catch(() => undefined);
    if (stateMachineArn) await sfn.send(new DeleteStateMachineCommand({ stateMachineArn }));
    const { taskDefinitionArns = [] } = await ecs.send(
      new ListTaskDefinitionsCommand({ familyPrefix: family }),
    );
    for (const arn of taskDefinitionArns)
      await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
  });

  it("runs a task from a schedule with an ECS target", async () => {
    await scheduler.send(
      new CreateScheduleCommand({
        Name: schedule,
        ScheduleExpression: "rate(1 minute)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: clusterArn,
          RoleArn: ROLE,
          EcsParameters: {
            TaskDefinitionArn: taskDefinitionArn,
            LaunchType: "FARGATE",
            TaskCount: 1,
            NetworkConfiguration: { awsvpcConfiguration: { Subnets: [subnet] } },
          },
        },
      }),
    );
    const task = await waitFor("task started by the schedule", () => tasksStartedBy("scheduler"));
    expect(task.taskDefinitionArn).toBe(taskDefinitionArn);
  });

  // Trang execution đọc Cluster từ tham số của bước để link sang trang cluster
  it("runs a task from a state machine and keeps the cluster in the step parameters", async () => {
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
        name: machine,
        definition: JSON.stringify(definition),
        roleArn: ROLE,
      }),
    ));
    const { executionArn = "" } = await sfn.send(new StartExecutionCommand({ stateMachineArn }));
    const status = await waitFor("execution to finish", async () => {
      const result = await sfn.send(new DescribeExecutionCommand({ executionArn }));
      return result.status === "RUNNING" ? undefined : result.status;
    });
    expect(status).toBe("SUCCEEDED");

    const { events = [] } = await sfn.send(new GetExecutionHistoryCommand({ executionArn }));
    const scheduled = events.find(
      (event) => event.taskScheduledEventDetails,
    )?.taskScheduledEventDetails;
    expect(scheduled?.resourceType).toBe("ecs");
    expect(JSON.parse(scheduled?.parameters ?? "{}").Cluster).toBe(clusterArn);
  });
});
