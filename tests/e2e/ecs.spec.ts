import {
  CreateClusterCommand,
  DeleteClusterCommand,
  DeleteServiceCommand,
  DescribeClustersCommand,
  DeregisterTaskDefinitionCommand,
  ECSClient,
  ListClustersCommand,
  ListTaskDefinitionsCommand,
  RunTaskCommand,
  StopTaskCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CloudWatchLogsClient, DeleteLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import { DescribeSubnetsCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của ECS trên UI (spec 8 › Kiểm tra): Create cluster → Create task definition (secret,
// awslogs) → Run task ghi đè env → Stopped, exit code, Logs, link secret → Create service → Update
// desired 0 → Delete service → Delete cluster. Thêm 2 mục Review Focus: cluster / task không có.
// Target ECS của EventBridge và Step Functions kiểm ở IT

const cluster = uniqueName("ecs");
const family = uniqueName("ecs-td");
const webFamily = uniqueName("ecs-web");
const service = uniqueName("ecs-svc");
const secretName = uniqueName("ecs-secret");
const logGroup = `/${uniqueName("ecs-logs")}`;
const SECRET_VALUE = "e2e-secret-value";
const EXIT_CODE = 3;
// Thời gian một task busybox chạy xong (image có sẵn sau lần đầu)
const TASK_TIMEOUT_MS = 60_000;

test.describe.configure({ mode: "serial" });

let config: ReturnType<typeof viaConsole>;
let region = "";
let secretArn = "";
const ecs = () => new ECSClient(config);

test.beforeAll(async () => {
  region = (await consoleConfig()).region;
  config = viaConsole(region);
  secretArn =
    (
      await new SecretsManagerClient(config).send(
        new CreateSecretCommand({ Name: secretName, SecretString: SECRET_VALUE }),
      )
    ).ARN ?? "";
  // Task definition cho service: nginx chạy mãi (busybox thoát ngay thì service tạo task liên tục)
  await ecs().send(
    new RegisterTaskDefinitionCommand({
      family: webFamily,
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
      cpu: "256",
      memory: "512",
      containerDefinitions: [
        { name: "web", image: "public.ecr.aws/nginx/nginx:alpine", essential: true },
      ],
    }),
  );
});

test.afterAll(async () => {
  const client = ecs();
  await client
    .send(new DeleteServiceCommand({ cluster, service, force: true }))
    .catch(() => undefined);
  await client.send(new DeleteClusterCommand({ cluster })).catch(() => undefined);
  for (const name of [family, webFamily]) {
    const { taskDefinitionArns = [] } = await client.send(
      new ListTaskDefinitionsCommand({ familyPrefix: name }),
    );
    for (const arn of taskDefinitionArns)
      await client.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
  }
  await new SecretsManagerClient(config)
    .send(new DeleteSecretCommand({ SecretId: secretName, ForceDeleteWithoutRecovery: true }))
    .catch(() => undefined);
  await new CloudWatchLogsClient(config)
    .send(new DeleteLogGroupCommand({ logGroupName: logGroup }))
    .catch(() => undefined);
});

test("creates a cluster", async ({ page }) => {
  await page.goto("/ecs/clusters");
  await page.getByRole("button", { name: "Create cluster" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Cluster name" }).fill(cluster);
  await dialog.getByRole("button", { name: "Create cluster" }).click();

  await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}$`));
  await expect(page.getByRole("heading", { level: 1, name: cluster })).toBeVisible();
});

test("registers a task definition from JSON", async ({ page }) => {
  const definition = {
    family,
    requiresCompatibilities: ["FARGATE"],
    networkMode: "awsvpc",
    cpu: "256",
    memory: "512",
    containerDefinitions: [
      {
        name: "main",
        image: "public.ecr.aws/docker/library/busybox:latest",
        essential: true,
        command: ["sh", "-c", `echo SEC=$SEC EXTRA=$EXTRA; exit ${EXIT_CODE}`],
        secrets: [{ name: "SEC", valueFrom: secretArn }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroup,
            "awslogs-region": region,
            "awslogs-stream-prefix": "e2e",
          },
        },
      },
    ],
  };

  await page.goto("/ecs/task-definitions/create");
  // Editor là Ace: thay toàn bộ mẫu; insertText không qua phím nên Ace không tự thêm ngoặc đóng
  await page.locator(".ace_text-input").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(JSON.stringify(definition));
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/ecs/task-definitions/${family}/1$`));
  await expect(page.getByRole("heading", { level: 1, name: `${family}:1` })).toBeVisible();
  // valueFrom là ARN secret: link sang trang Secrets Manager theo tên
  await expect(page.getByRole("link", { name: secretName })).toHaveAttribute(
    "href",
    `/secretsmanager/secrets/detail?name=${secretName}`,
  );
});

test("runs a task with an environment override and shows its exit code and logs", async ({
  page,
}) => {
  await page.goto(`/ecs/task-definitions/${family}/1`);
  await page.getByRole("link", { name: "Run task" }).click();
  await expect(page).toHaveURL(/\/ecs\/run-task\?taskDefinition=/);

  const form = page.locator("form");
  await choose(page, form, /^Cluster/, { name: cluster });
  await expect(form.getByRole("button", { name: /^Subnets/ })).toBeVisible();
  await form.getByRole("button", { name: "Add environment variable" }).click();
  await form.getByRole("textbox", { name: /environment variables Key/ }).fill("EXTRA");
  await form.getByRole("textbox", { name: /environment variables Value/ }).fill("x1");
  await form.getByRole("button", { name: "Run task" }).click();

  await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}/tasks/[0-9a-f]+$`));
  // Trang tự hỏi lại khi task chưa dừng
  await expect(page.getByText("EssentialContainerExited")).toBeVisible({
    timeout: TASK_TIMEOUT_MS,
  });
  await expect(page.getByRole("row", { name: /main/ })).toContainText(String(EXIT_CODE));

  await page.getByRole("tab", { name: "Logs" }).click();
  await expect(page.getByText(`SEC=${SECRET_VALUE} EXTRA=x1`)).toBeVisible({
    timeout: TASK_TIMEOUT_MS,
  });
});

test("creates a service, scales it to zero and deletes it", async ({ page }) => {
  await page.goto(`/ecs/clusters/${cluster}/services/create`);
  const form = page.locator("form");
  await form.getByRole("textbox", { name: "Service name" }).fill(service);
  await choose(page, form, /^Task definition/, { name: webFamily });
  await form.getByRole("button", { name: "Create service" }).click();

  await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}/services/${service}$`));
  // Nút Refresh ở header tải lại cả bảng Tasks
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).first().click();
    await expect(page.getByRole("row", { name: /ecs-svc\// })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: TASK_TIMEOUT_MS });

  await page.getByRole("button", { name: "Update" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Desired tasks" }).fill("0");
  await dialog.getByRole("button", { name: "Update" }).click();
  await expect(flash(page)).toContainText(`Updated ${service}`);
  // Xóa khi task đã dừng: xóa service lúc task còn chạy thì Floci 2.4.0 có thể để lại task (spec 7 #10)
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).last().click();
    await expect(page.getByText("No running tasks")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: TASK_TIMEOUT_MS });

  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}$`));
  await expect(flash(page)).toContainText("Deleted 1 service");
});

// Review Focus 4: cluster lạ trả "not found" mà không gọi ListTasks (400) và không tạo "default"
test("shows a missing cluster as not found without creating the default cluster", async ({
  page,
}) => {
  const defaultExists = async () =>
    ((await ecs().send(new ListClustersCommand({}))).clusterArns ?? []).some((arn) =>
      arn.endsWith("/default"),
    );
  const hadDefault = await defaultExists();

  await page.goto(`/ecs/clusters/${uniqueName("missing")}`);
  await expect(page.getByText(/^Cluster .* not found$/)).toBeVisible();

  test.skip(hadDefault, "Floci already has a default cluster");
  await page.goto("/ecs/clusters/default");
  await expect(page.getByText("Cluster default not found")).toBeVisible();
  expect(await defaultExists()).toBe(false);
});

// Finding #1 của review cuối: dữ liệu cluster còn trong cache không được mở tab Services / Tasks
// trước khi hỏi lại cluster (ListServices với cluster đã xóa trả 400 → console.error)
test("shows a cluster deleted from its page as not found after going back", async ({ page }) => {
  const doomed = uniqueName("ecs-back");
  await ecs().send(new CreateClusterCommand({ clusterName: doomed }));

  await page.goto(`/ecs/clusters/${doomed}`);
  await expect(page.getByRole("heading", { level: 1, name: doomed })).toBeVisible();
  // Nút Delete của header (bảng Services cũng có một nút Delete)
  await page.getByRole("button", { name: "Delete" }).first().click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(page).toHaveURL(/\/ecs\/clusters$/);

  await page.goBack();
  await expect(page.getByText(`Cluster ${doomed} not found`)).toBeVisible();
});

// Review Focus 5: task mất sau khi Floci restart (hoặc ID gõ tay)
test("shows a missing task as not found", async ({ page }) => {
  await page.goto(`/ecs/clusters/${cluster}/tasks/0000`);
  await expect(page.getByText("Task 0000 not found")).toBeVisible();
  await expect(page.getByText("Floci doesn't keep tasks across restarts.")).toBeVisible();
});

// Minor #7 của review cuối: xóa không được (cluster còn task) thì ở lại trang chi tiết và báo lý do
test.describe("deleting a cluster that still runs a task", () => {
  // DeleteCluster trả 400 ClusterContainsTasksException: trình duyệt ghi console.error, đúng mong đợi
  test.use({ danglingProbes: true });

  test("stays on the cluster page and says why", async ({ page }) => {
    const { Subnets = [] } = await new EC2Client(config).send(new DescribeSubnetsCommand({}));
    const subnet = Subnets.find((candidate) => candidate.DefaultForAz)?.SubnetId ?? "";
    const { tasks = [] } = await ecs().send(
      new RunTaskCommand({
        cluster,
        taskDefinition: `${family}:1`,
        launchType: "FARGATE",
        networkConfiguration: { awsvpcConfiguration: { subnets: [subnet] } },
        overrides: { containerOverrides: [{ name: "main", command: ["sh", "-c", "sleep 300"] }] },
      }),
    );
    try {
      await page.goto(`/ecs/clusters/${cluster}`);
      // Nút Delete của header (bảng Services cũng có một nút Delete)
      await page.getByRole("button", { name: "Delete" }).first().click();
      await confirmDelete(page.getByRole("dialog"));
      await expect(flash(page)).toContainText("ClusterContainsTasksException");
      await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}$`));
      await expect(page.getByRole("heading", { level: 1, name: cluster })).toBeVisible();
    } finally {
      await ecs().send(new StopTaskCommand({ cluster, task: tasks[0]?.taskArn }));
    }
  });
});

test("stops a running task from its page", async ({ page }) => {
  await page.goto(`/ecs/run-task?cluster=${cluster}&taskDefinition=${family}%3A1`);
  const form = page.locator("form");
  await form.getByRole("textbox", { name: "main: command" }).fill('["sh","-c","sleep 300"]');
  await form.getByRole("button", { name: "Run task" }).click();

  await expect(page).toHaveURL(new RegExp(`/ecs/clusters/${cluster}/tasks/[0-9a-f]+$`));
  const stop = page.getByRole("button", { name: "Stop" });
  await expect(stop).toBeEnabled();
  await stop.click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("UserInitiated")).toBeVisible({ timeout: TASK_TIMEOUT_MS });
  await expect(page.getByText("Stopped from Local Console")).toBeVisible();
});

test("deletes the cluster", async ({ page }) => {
  // Task vừa Stop còn ở STOPPING vài giây: ListTasks không thấy nhưng Floci vẫn đếm là đang chạy
  await waitFor("cluster to have no running tasks", async () => {
    const [found] =
      (await ecs().send(new DescribeClustersCommand({ clusters: [cluster] }))).clusters ?? [];
    return found && !found.runningTasksCount && !found.pendingTasksCount ? true : undefined;
  });
  await page.goto("/ecs/clusters");
  await page.getByPlaceholder("Find clusters by name").fill(cluster);
  await page.getByRole("checkbox", { name: new RegExp(`Select cluster ${cluster}`) }).check();
  await page.getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page.getByRole("dialog"));
  await expect(flash(page)).toContainText("Deleted 1 cluster");
});
