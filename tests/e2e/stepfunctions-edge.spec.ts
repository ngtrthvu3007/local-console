import type { Page } from "@playwright/test";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { ACCOUNT_ID, consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, setEditor, test, uniqueName } from "./fixtures.ts";

// Trường hợp biên của trang Step Functions: execution xong giữa hai lần tự làm mới (bước cuối không
// được kẹt ở Running), Map quá lớn gập sẵn, bước gọi function đã xóa báo "(not found)".

const quick = uniqueName("quick");
const big = uniqueName("big");
const dangling = uniqueName("dangling");
const MISSING_FUNCTION = uniqueName("nofn");
// Quá ngưỡng COLLAPSE_CHILDREN_LIMIT (20) của console
const BIG_MAP_ITEMS = Array.from({ length: 25 }, (_, index) => index);

// Bước cuối gặp lỗi Lambda không tồn tại, và Floci còn dò function trên mỗi lần mở trang
test.use({ danglingProbes: true });
test.describe.configure({ mode: "serial" });

let sfn: SFNClient;
let region: string;

const pass = { Type: "Pass", End: true };

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  sfn = new SFNClient(viaConsole(region));
  const roleArn = `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-sfn`;
  const create = (name: string, definition: object) =>
    sfn.send(
      new CreateStateMachineCommand({ name, roleArn, definition: JSON.stringify(definition) }),
    );
  await create(quick, {
    StartAt: "Pause",
    States: { Pause: { Type: "Wait", Seconds: 3, Next: "After" }, After: pass },
  });
  await create(big, {
    StartAt: "Each",
    States: {
      Each: {
        Type: "Map",
        ItemsPath: "$.items",
        Iterator: { StartAt: "Item", States: { Item: pass } },
        End: true,
      },
    },
  });
  await create(dangling, {
    StartAt: "Call",
    States: {
      Call: {
        Type: "Task",
        Resource: `arn:aws:lambda:${region}:${ACCOUNT_ID}:function:${MISSING_FUNCTION}`,
        End: true,
      },
    },
  });
});

test.afterAll(async () => {
  for (const name of [quick, big, dangling]) {
    await sfn
      .send(
        new DeleteStateMachineCommand({
          stateMachineArn: `arn:aws:states:${region}:${ACCOUNT_ID}:stateMachine:${name}`,
        }),
      )
      .catch(() => {});
  }
});

async function startWith(page: Page, machine: string, input: object) {
  await page.goto(`/stepfunctions/statemachines/${machine}`);
  await page.getByRole("button", { name: "Start execution" }).first().click();
  await setEditor(page, JSON.stringify(input));
  await page.getByRole("dialog").getByRole("button", { name: "Start execution" }).click();
  await expect(flash(page)).toContainText("Started execution");
}

test("a run that finishes while the page polls ends with every step Succeeded", async ({
  page,
}) => {
  await startWith(page, quick, {});
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  // Wait 3 s: tự làm mới đang chạy, rồi execution xong giữa hai lần hỏi history
  await expect(page.getByText("Succeeded", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  // Bảng có dòng gập được: Cloudscape đặt role treegrid, nên chọn theo thẻ
  const steps = page.locator("table");
  await expect(steps.getByText("Succeeded", { exact: true })).toHaveCount(2);
  await expect(steps.getByText("Running", { exact: true })).toHaveCount(0);
});

test("a Map with many iterations starts collapsed and expands on demand", async ({ page }) => {
  await startWith(page, big, { items: BIG_MAP_ITEMS });
  await expect(page.getByRole("link", { name: "Each", exact: true })).toBeVisible();
  await expect(page.getByText("Iteration #0")).toBeHidden();

  await page
    .getByRole("button", { name: /expand/i })
    .first()
    .click();
  await expect(page.getByText("Iteration #0")).toBeVisible();
  await expect(page.getByText("Iteration #24")).toBeVisible();
});

test("a task that calls a deleted function is flagged, not linked", async ({ page }) => {
  await startWith(page, dangling, {});
  await expect(page.getByText(`${MISSING_FUNCTION} (not found)`)).toBeVisible();
  await expect(page.getByRole("link", { name: MISSING_FUNCTION })).toHaveCount(0);
});
