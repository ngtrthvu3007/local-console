import type { Page } from "@playwright/test";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  DescribeInstancesCommand,
  EC2Client,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của EC2 trên UI: Launch (có user data) → chi tiết Pending → Running → tab User data →
// Reboot → Terminate. Stop mất ~30 s nên để IT kiểm. Instance của CloudFormation kiểm link hai chiều

const instanceName = uniqueName("ec2");
const doubleName = uniqueName("ec2dbl");
const stackName = uniqueName("ec2-stack");
const USER_DATA = 'echo "xin chào" > /tmp/hello';

test.describe.configure({ mode: "serial" });

let cloudformation: CloudFormationClient;
let ec2: EC2Client;

test.beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  cloudformation = new CloudFormationClient(config);
  ec2 = new EC2Client(config);
});

// Xóa stack thì Floci terminate luôn instance của stack. Instance launch từ UI thì tự terminate theo
// tên: test fail giữa chừng hoặc bấm đúp Launch không để lại instance đang chạy
test.afterAll(async () => {
  await cloudformation
    .send(new DeleteStackCommand({ StackName: stackName }))
    .catch(() => undefined);

  const { Reservations = [] } = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Name", Values: [instanceName, doubleName] },
        { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] },
      ],
    }),
  );
  const ids = Reservations.flatMap((group) => group.Instances ?? []).flatMap((instance) =>
    instance.InstanceId ? [instance.InstanceId] : [],
  );
  if (ids.length) await ec2.send(new TerminateInstancesCommand({ InstanceIds: ids }));
});

const runAction = async (page: Page, action: string) => {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action }).click();
};

test("launches an instance with user data and reads it back", async ({ page }) => {
  await page.goto("/ec2/instances/launch");
  // AMI mặc định chọn sẵn khi catalog tải xong
  await expect(page.getByRole("button", { name: /Amazon Linux 2023 AMI/ })).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill(instanceName);
  await page.locator(".ace_text-input").fill(USER_DATA);
  await page.getByRole("button", { name: "Launch instance" }).click();

  await expect(page).toHaveURL(/\/ec2\/instances\/i-/);
  await expect(flash(page)).toContainText("Launched instance");
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`^${instanceName} \\(i-`) }),
  ).toBeVisible();
  // Pending → Running mất ~10 s, lâu hơn khi kéo image lần đầu
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });

  await page.getByRole("tab", { name: "User data" }).click();
  await expect(page).toHaveURL(/\?tab=user-data$/);
  await expect(page.getByText("xin chào")).toBeVisible();
});

test("lists the instance, filters by state, and reboots from Actions", async ({ page }) => {
  await page.goto("/ec2/instances");
  await page.getByPlaceholder("Find instances by name or ID").fill(instanceName);
  await expect(page.getByRole("link", { name: instanceName })).toBeVisible();

  await page.getByRole("button", { name: /Filter by state/ }).click();
  await page.getByRole("option", { name: "Stopped" }).click();
  await expect(page.getByRole("link", { name: instanceName })).toHaveCount(0);
  await page.getByRole("button", { name: /Filter by state/ }).click();
  await page.getByRole("option", { name: "All states" }).click();

  // Nhãn của radio là Instance ID, không có Name: chọn theo dòng
  await page
    .getByRole("row", { name: new RegExp(instanceName) })
    .getByRole("radio")
    .check();
  await runAction(page, "Reboot instance");
  await expect(flash(page)).toContainText("Rebooting i-");
});

test("terminates from the detail page after confirming", async ({ page }) => {
  await page.goto("/ec2/instances");
  await page.getByRole("link", { name: instanceName }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`^${instanceName} \\(i-`) }),
  ).toBeVisible();

  await runAction(page, "Terminate instance");
  await page.getByRole("dialog").getByRole("button", { name: "Terminate instance" }).click();
  await expect(flash(page)).toContainText("Terminating i-");
  await expect(page.getByText("Terminated", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/If you didn't terminate it/)).toBeVisible();
});

test("shows an instance that no longer exists as not found, without console errors", async ({
  page,
}) => {
  await page.goto("/ec2/instances/i-0000000000000dead");

  await expect(page.getByText("Instance i-0000000000000dead not found")).toBeVisible();
  await page.getByRole("link", { name: "View instances" }).click();
  await expect(page).toHaveURL(/\/ec2\/instances$/);
});

test("links an instance made by CloudFormation with its stack, both ways", async ({ page }) => {
  const template = {
    Resources: {
      Server: {
        Type: "AWS::EC2::Instance",
        Properties: {
          ImageId: "ami-0abcdef1234567891",
          InstanceType: "t3.micro",
          Tags: [{ Key: "Name", Value: `${stackName}-server` }],
        },
      },
    },
  };
  await cloudformation.send(
    new CreateStackCommand({ StackName: stackName, TemplateBody: JSON.stringify(template) }),
  );
  await waitFor("stack to be created", async () => {
    const { Stacks = [] } = await cloudformation.send(
      new DescribeStacksCommand({ StackName: stackName }),
    );
    return Stacks[0]?.StackStatus === "CREATE_COMPLETE" ? true : undefined;
  });
  const { StackResources = [] } = await cloudformation.send(
    new DescribeStackResourcesCommand({ StackName: stackName }),
  );
  const instanceId = StackResources[0]?.PhysicalResourceId ?? "";

  await page.goto(`/ec2/instances/${instanceId}`);
  await page.getByRole("link", { name: stackName, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: stackName })).toBeVisible();

  await page.getByRole("tab", { name: /Resources/ }).click();
  await page.getByRole("link", { name: instanceId }).click();
  await expect(page).toHaveURL(new RegExp(`/ec2/instances/${instanceId}$`));
});

test("warns when the chosen AMI is one Floci doesn't run as named", async ({ page }) => {
  await page.goto("/ec2/instances/launch");
  await expect(page.getByRole("button", { name: /Amazon Linux 2023 AMI/ })).toBeVisible();
  await expect(page.getByText(/Floci doesn't run Windows/)).toHaveCount(0);

  await page.getByRole("button", { name: /Amazon Linux 2023 AMI/ }).click();
  await page.getByRole("option", { name: /Windows Server 2022/ }).click();

  await expect(page.getByText(/Floci doesn't run Windows/)).toBeVisible();
});

test("launches once when Launch instance is clicked twice quickly", async ({ page }) => {
  await page.goto("/ec2/instances/launch");
  await expect(page.getByRole("button", { name: /Amazon Linux 2023 AMI/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Name" }).fill(doubleName);

  await page.getByRole("button", { name: "Launch instance" }).dblclick();
  await expect(page).toHaveURL(/\/ec2\/instances\/i-/);

  await page.goto("/ec2/instances");
  await page.getByPlaceholder("Find instances by name or ID").fill(doubleName);
  await expect(page.getByRole("link", { name: doubleName })).toHaveCount(1);
});

test.describe("when the AMI list can't load", () => {
  // Lỗi cố ý: trình duyệt ghi console.error cho request 400 tới /aws/
  test.use({ danglingProbes: true });

  test("shows the error with Retry, and recovers", async ({ page }) => {
    const failImages = (route: import("@playwright/test").Route) =>
      route.request().postData()?.includes("Action=DescribeImages")
        ? route.fulfill({
            status: 400,
            contentType: "text/xml",
            body: "<Response><Errors><Error><Code>InvalidParameterValue</Code><Message>boom</Message></Error></Errors><RequestID>1</RequestID></Response>",
          })
        : route.continue();
    await page.route("**/aws/**", failImages);

    await page.goto("/ec2/instances/launch");
    await expect(page.getByText("Couldn't load the AMI list")).toBeVisible();

    await page.unroute("**/aws/**", failImages);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Couldn't load the AMI list")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Amazon Linux 2023 AMI/ })).toBeVisible();
  });
});
