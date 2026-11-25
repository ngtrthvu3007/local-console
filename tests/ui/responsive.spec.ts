import { join } from "node:path";
import { expect, test } from "../e2e/fixtures.ts";

// Mỗi trang chạy trên 4 khung (project ui-desktop / ui-laptop / ui-tablet / ui-phone)
const PAGES = [
  { slug: "home", path: "/" },
  { slug: "s3-buckets", path: "/s3/buckets" },
  { slug: "s3-create", path: "/s3/buckets/create" },
  { slug: "lambda-functions", path: "/lambda/functions" },
  { slug: "lambda-create", path: "/lambda/functions/create" },
  { slug: "dynamodb-tables", path: "/dynamodb/tables" },
  { slug: "dynamodb-create", path: "/dynamodb/tables/create" },
  { slug: "rds-databases", path: "/rds/databases" },
  { slug: "rds-create", path: "/rds/databases/create" },
  { slug: "ec2-instances", path: "/ec2/instances" },
  { slug: "ec2-launch", path: "/ec2/instances/launch" },
  { slug: "sqs-queues", path: "/sqs/queues" },
  { slug: "sqs-create", path: "/sqs/queues/create" },
  { slug: "elasticache-clusters", path: "/elasticache/clusters" },
  { slug: "mq-brokers", path: "/mq/brokers" },
  { slug: "sns-sms", path: "/sns/sms" },
  { slug: "eventbridge-buses", path: "/eventbridge/buses" },
  { slug: "eventbridge-rules", path: "/eventbridge/rules" },
  { slug: "eventbridge-rule-create", path: "/eventbridge/rules/create" },
  { slug: "eventbridge-schedules", path: "/eventbridge/schedules" },
  { slug: "eventbridge-schedule-create", path: "/eventbridge/schedules/create" },
  { slug: "stepfunctions-state-machines", path: "/stepfunctions/statemachines" },
  { slug: "cloudformation-stacks", path: "/cloudformation/stacks" },
  { slug: "ses-mailbox", path: "/ses/mailbox" },
  { slug: "ses-identities", path: "/ses/identities" },
  { slug: "ses-templates", path: "/ses/templates" },
  { slug: "ses-configuration-sets", path: "/ses/configuration-sets" },
  { slug: "cognito-pools", path: "/cognito/user-pools" },
  { slug: "secretsmanager-secrets", path: "/secretsmanager/secrets" },
  { slug: "secretsmanager-create", path: "/secretsmanager/secrets/create" },
  { slug: "kms-keys", path: "/kms/keys" },
  { slug: "kms-aws-keys", path: "/kms/aws-keys" },
  { slug: "kms-create", path: "/kms/keys/create" },
  { slug: "cloudfront-distributions", path: "/cloudfront/distributions" },
  { slug: "cloudfront-create", path: "/cloudfront/distributions/create" },
  { slug: "appsync-apis", path: "/appsync/apis" },
  { slug: "appsync-create", path: "/appsync/apis/create" },
  { slug: "ssm-parameters", path: "/ssm/parameters" },
  { slug: "ssm-create", path: "/ssm/parameters/create" },
];

// Cloudscape gập side navigation dưới mốc này (PHONE_MAX_WIDTH_PX của console)
const PHONE_MAX_WIDTH_PX = 688;

// Dòng của aria snapshot cho phần tử tương tác không có tên: "- button" hoặc "- button [disabled]"
const UNNAMED_CONTROL =
  /^\s*- (button|link|checkbox|radio|textbox|combobox|searchbox|switch|tab)( \[[^\]"]*\])*:?$/;

for (const { slug, path } of PAGES) {
  test(`${slug}: layout, headings and names`, async ({ page }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect.soft(overflow.page, "no horizontal scroll").toBeLessThanOrEqual(overflow.viewport + 1);

    expect.soft(await page.getByRole("heading", { level: 1 }).count(), "exactly one h1").toBe(1);
    expect.soft(await page.locator("html").getAttribute("lang"), "html lang").toBeTruthy();

    const snapshot = await page.locator("body").ariaSnapshot();
    const unnamed = snapshot.split("\n").filter((line) => UNNAMED_CONTROL.test(line));
    expect.soft(unnamed, "every control has an accessible name").toEqual([]);

    // Ảnh để review UX bằng mắt: results/screens/<khung>/<trang>.png
    await page.screenshot({
      path: join(
        testInfo.project.testDir,
        "..",
        "results",
        "screens",
        testInfo.project.name,
        `${slug}.png`,
      ),
      fullPage: true,
    });
  });
}

test("side navigation fits the screen size", async ({ page }) => {
  await page.goto("/");
  const navigationLink = page
    .getByRole("navigation", { name: "Side navigation" })
    .getByRole("link", { name: "S3", exact: true });
  const width = page.viewportSize()!.width;
  if (width > PHONE_MAX_WIDTH_PX) {
    await expect(navigationLink).toBeVisible();
    return;
  }
  // Điện thoại: menu gập sẵn, mở bằng nút rồi chọn được service
  await expect(navigationLink).toBeHidden();
  await page.getByRole("button", { name: "Open side navigation" }).click();
  await navigationLink.click();
  await expect(page).toHaveURL(/\/s3\/buckets$/);
});
