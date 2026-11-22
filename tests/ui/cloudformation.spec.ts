import { join } from "node:path";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, test, uniqueName } from "../e2e/fixtures.ts";

// Trang chi tiết stack (3 tab) trên 4 khung, với logical ID dài, resource bị stub và stack lỗi: không tràn ngang,
// một h1, control có tên. Chạy ở các project ui-*.

const okStack = uniqueName("uicfn");
const failStack = uniqueName("uicfnfail");
const queue = uniqueName("uiqueue");
const LONG_LOGICAL_ID = "ProcessingPipelineDeadLetterQueueWithAVeryLongGeneratedNameA1B2C3D4";
const UNNAMED_CONTROL =
  /^\s*- (button|link|checkbox|radio|textbox|combobox|searchbox|switch|tab)( \[[^\]"]*\])*:?$/;

let cloudformation: CloudFormationClient;

test.beforeAll(async () => {
  const { region } = await consoleConfig();
  cloudformation = new CloudFormationClient(viaConsole(region));
  await cloudformation.send(
    new CreateStackCommand({
      StackName: okStack,
      TemplateBody: JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          [LONG_LOGICAL_ID]: { Type: "AWS::SQS::Queue", Properties: { QueueName: queue } },
          Stubbed: {
            Type: "AWS::Glue::Database",
            Properties: { CatalogId: "000000000000", DatabaseInput: { Name: "lc_ui_db" } },
          },
        },
        Outputs: { [`${LONG_LOGICAL_ID}Url`]: { Value: { Ref: LONG_LOGICAL_ID } } },
      }),
    }),
  );
  // Import một export không có: stack lỗi với lý do dài
  await cloudformation.send(
    new CreateStackCommand({
      StackName: failStack,
      TemplateBody: JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          Queue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: { "Fn::ImportValue": `${LONG_LOGICAL_ID}-export` } },
          },
        },
      }),
    }),
  );
});

test.afterAll(async () => {
  for (const name of [okStack, failStack]) {
    await cloudformation.send(new DeleteStackCommand({ StackName: name })).catch(() => undefined);
  }
});

for (const [label, stack] of [
  ["ok", okStack],
  ["failed", failStack],
] as const) {
  for (const slug of ["events", "resources", "outputs"]) {
    test(`${label} stack, ${slug} tab: layout, headings and names`, async ({ page }, testInfo) => {
      await page.goto(`/cloudformation/stacks/${stack}${slug === "events" ? "" : `?tab=${slug}`}`);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect.soft(overflow.page, "no horizontal scroll").toBeLessThanOrEqual(overflow.viewport + 1);
      expect.soft(await page.getByRole("heading", { level: 1 }).count(), "exactly one h1").toBe(1);

      const snapshot = await page.locator("body").ariaSnapshot();
      const unnamed = snapshot.split("\n").filter((line) => UNNAMED_CONTROL.test(line));
      expect.soft(unnamed, "every control has an accessible name").toEqual([]);

      await page.screenshot({
        path: join(
          testInfo.project.testDir,
          "..",
          "results",
          "screens",
          testInfo.project.name,
          `cloudformation-${label}-${slug}.png`,
        ),
        fullPage: true,
      });
    });
  }
}
